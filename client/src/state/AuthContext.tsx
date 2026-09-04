import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyActionCode,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword as updateFirebasePassword,
  updateProfile as updateFirebaseProfile,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  type ActionCodeSettings,
} from "firebase/auth";
import { firebaseAuth } from "../firebase";
import { authApi, claimDisplayName } from "../api/auth";
import { ApiError, unauthorized, validationError } from "../errors";
import type { Profile, SignUpResult } from "../api/types";

// Routes the verification link back into OUR app (handleCodeInApp: true) instead of
// Firebase's generic hosted confirmation page, which was a dead end -- it never told
// people to come back and sign in. AuthScreen applies the code itself on load; see
// applyEmailVerificationCode below.
function verificationActionCodeSettings(): ActionCodeSettings {
  return { url: window.location.origin, handleCodeInApp: true };
}

// Same trick for the password-reset email: routes back into the app (?mode=
// resetPassword&oobCode=...) instead of Firebase's generic hosted reset page, so the
// flow stays inside our own UI and matches our theme/copy.
function passwordResetActionCodeSettings(): ActionCodeSettings {
  return { url: window.location.origin, handleCodeInApp: true };
}

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  isSubmitting: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerification: () => Promise<void>;
  applyEmailVerificationCode: (oobCode: string) => Promise<void>;
  sendPasswordReset: (identifierOrEmail: string) => Promise<void>;
  verifyPasswordResetCode: (oobCode: string) => Promise<string>;
  confirmPasswordReset: (oobCode: string, newPassword: string) => Promise<void>;
  updateDisplayName: (newDisplayName: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set while signIn/signUp/signOut are driving the flow themselves, so the mount-time
  // onAuthStateChanged listener doesn't also race to load/clear the profile.
  const handlingAction = useRef(false);

  // Asks our backend for the profile behind the current Firebase session. A 401
  // means "not logged in" or "please verify your email first" -- either way there's
  // no usable profile, and for the verification case specifically we also drop the
  // Firebase session so the UI shows a clean logged-out state instead of a stuck
  // half-authenticated one.
  const loadProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      const profile = await authApi.me();
      // A disabled account (see api/users.ts's setDisabled/remove) is fully locked
      // out client-side the moment its profile loads, not just blocked from
      // individual writes -- Firestore rules (isActiveProfile) are the real security
      // boundary for that, this is just what makes the UI actually reflect it.
      if (profile?.disabled) {
        await firebaseSignOut(firebaseAuth).catch(() => {});
        throw new ApiError("This account has been deactivated. Contact the league admin.", 403);
      }
      return profile;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await firebaseSignOut(firebaseAuth).catch(() => {});
        return null;
      }
      throw error;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfile(await loadProfile());
  }, [loadProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (handlingAction.current) return;
      setIsLoading(true);
      try {
        setProfile(user ? await loadProfile() : null);
      } catch {
        // A silent session restore (e.g. a deactivated account's still-valid
        // session) has no UI to show an error in -- loadProfile already signed them
        // out above, so just land on the logged-out state.
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, [loadProfile]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setIsSubmitting(true);
      handlingAction.current = true;
      try {
        const email = identifier.includes("@") ? identifier.toLowerCase() : (await authApi.resolveIdentifier(identifier)).email;
        await signInWithEmailAndPassword(firebaseAuth, email, password);
        const loaded = await loadProfile();
        if (!loaded) {
          throw new ApiError("Please verify your email before signing in. Check your inbox, or request a new link.", 401);
        }
        setProfile(loaded);
        // Best-effort -- an admin-visible "last login" timestamp is a nice-to-have,
        // never something a real sign-in should fail over.
        authApi.recordLogin().catch(() => {});
      } finally {
        setIsSubmitting(false);
        handlingAction.current = false;
      }
    },
    [loadProfile],
  );

  const signUp = useCallback(
    async (displayName: string, email: string, password: string): Promise<SignUpResult> => {
      setIsSubmitting(true);
      handlingAction.current = true;
      try {
        const { available } = await authApi.checkDisplayName(displayName);
        if (!available) {
          throw new ApiError("That display name is already taken.", 400);
        }

        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        // Reserve the (possibly disambiguated) display name immediately, before
        // verification -- so display-name login works from the very first sign-in
        // rather than only after a profile has been created once already.
        const claimedName = await claimDisplayName(credential.user.uid, email, displayName);
        await updateFirebaseProfile(credential.user, { displayName: claimedName });
        await sendEmailVerification(credential.user, verificationActionCodeSettings());

        // Don't leave the user in a half-authenticated (signed into Firebase, no
        // backend profile yet) state -- sign out until they've actually verified.
        await firebaseSignOut(firebaseAuth);
        return { status: "verify_email", email };
      } finally {
        setIsSubmitting(false);
        handlingAction.current = false;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setIsSubmitting(true);
    handlingAction.current = true;
    try {
      await firebaseSignOut(firebaseAuth);
      setProfile(null);
    } finally {
      setIsSubmitting(false);
      handlingAction.current = false;
    }
  }, []);

  // Firebase's sendEmailVerification needs a *current* signed-in user object. Right
  // after sign-up we still have one (before the sign-out above); after a
  // verification-blocked login attempt we also still have one (Firebase itself
  // doesn't block sign-in for an unverified email -- only our backend does), so this
  // works from both the "check your email" screen and the login error state.
  const resendVerification = useCallback(async () => {
    if (!firebaseAuth.currentUser) {
      throw new ApiError("Sign in again to request a new verification link.", 401);
    }
    await sendEmailVerification(firebaseAuth.currentUser, verificationActionCodeSettings());
  }, []);

  // Called by AuthScreen when it sees ?mode=verifyEmail&oobCode=... in the URL
  // (handleCodeInApp routes the emailed link here instead of Firebase's hosted
  // page). Verifying the code does NOT sign the user in -- Firebase Auth sign-in
  // and email verification are separate; they still need to enter their password.
  const applyEmailVerificationCode = useCallback(async (oobCode: string) => {
    try {
      await applyActionCode(firebaseAuth, oobCode);
    } catch {
      throw new ApiError("That verification link is invalid or has expired. Request a new one below.", 400);
    }
  }, []);

  // Sends a reset link to whatever email the identifier resolves to. Deliberately
  // never reveals whether the account exists -- Firebase itself stays quiet about
  // that for unknown emails, and resolving a display name to a missing account
  // throws "No account found", which would leak the same thing, so that specific
  // error is swallowed here.
  const sendPasswordReset = useCallback(async (identifierOrEmail: string) => {
    let email: string;
    try {
      email = identifierOrEmail.includes("@") ? identifierOrEmail.toLowerCase() : (await authApi.resolveIdentifier(identifierOrEmail)).email;
    } catch {
      return;
    }
    await sendPasswordResetEmail(firebaseAuth, email, passwordResetActionCodeSettings()).catch(() => {});
  }, []);

  // Called by AuthScreen when it sees ?mode=resetPassword&oobCode=... in the URL.
  // Verifying the code doesn't consume it -- it just confirms the link is still
  // valid and returns the email it's for, so the reset form can show "Resetting
  // password for X" before the user commits to a new one.
  const verifyPasswordResetCode = useCallback(async (oobCode: string) => {
    try {
      return await firebaseVerifyPasswordResetCode(firebaseAuth, oobCode);
    } catch {
      throw new ApiError("That reset link is invalid or has expired. Request a new one below.", 400);
    }
  }, []);

  const confirmPasswordReset = useCallback(async (oobCode: string, newPassword: string) => {
    try {
      await firebaseConfirmPasswordReset(firebaseAuth, oobCode, newPassword);
    } catch {
      throw new ApiError("That reset link is invalid or has expired. Request a new one below.", 400);
    }
  }, []);

  // Renames the signed-in user: swaps the usernames/ reservation and profiles/
  // {uid}.displayName (see api/auth.ts's updateDisplayName), then keeps Firebase
  // Auth's own user.displayName in sync -- that field is what ensureProfile falls
  // back to and what claimDisplayName reads at sign-up, so it needs to match.
  const updateDisplayName = useCallback(
    async (newDisplayName: string) => {
      const user = firebaseAuth.currentUser;
      if (!user) throw unauthorized("You must be logged in to continue.");
      const cleaned = await authApi.updateDisplayName(newDisplayName);
      await updateFirebaseProfile(user, { displayName: cleaned });
      await refreshProfile();
    },
    [refreshProfile],
  );

  // Firebase requires a *recent* sign-in for a sensitive operation like changing your
  // own password -- reauthenticating with the current password first satisfies that
  // regardless of how old the session is, rather than surfacing Firebase's generic
  // "requires-recent-login" error and asking the user to sign out and back in.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) throw unauthorized("You must be logged in to continue.");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    } catch {
      throw validationError("Your current password is incorrect.");
    }
    await updateFirebasePassword(user, newPassword);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isSubmitting,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        resendVerification,
        applyEmailVerificationCode,
        sendPasswordReset,
        verifyPasswordResetCode,
        confirmPasswordReset,
        updateDisplayName,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
