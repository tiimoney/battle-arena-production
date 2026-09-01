import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import type { Profile, SignUpResult } from "../api/types";

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  isSubmitting: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resendVerification: (identifier: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const me = await authApi.me();
      setProfile(me);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setProfile(null);
      } else {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        await refreshProfile();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshProfile]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    setIsSubmitting(true);
    try {
      const me = await authApi.signIn({ identifier, password });
      setProfile(me);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const signUp = useCallback(async (displayName: string, email: string, password: string) => {
    setIsSubmitting(true);
    try {
      const result = await authApi.signUp({ displayName, email, password });
      if (result.status === "signed_in") {
        setProfile(result.profile);
      }
      return result;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const resendVerification = useCallback(async (identifier: string) => {
    await authApi.resendVerification(identifier);
  }, []);

  const signOut = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await authApi.signOut();
      setProfile(null);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ profile, isLoading, isSubmitting, signIn, signUp, signOut, refreshProfile, resendVerification }}
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
