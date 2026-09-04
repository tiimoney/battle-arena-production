import { useEffect, useState, type FormEvent } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../state/AuthContext";
import { ApiError } from "../errors";

type Mode = "login" | "signup" | "checkEmail" | "forgotPassword" | "resetPassword";

export function AuthScreen() {
  const {
    signIn,
    signUp,
    resendVerification,
    applyEmailVerificationCode,
    sendPasswordReset,
    verifyPasswordResetCode,
    confirmPasswordReset,
    isSubmitting,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  // Login accepts either the account's email or its (unique) display name; sign-up
  // always needs a real email address (verification is sent there).
  const [identifierOrEmail, setIdentifierOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resetOobCode, setResetOobCode] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // The verification email links back into the app itself (handleCodeInApp: true in
  // AuthContext) instead of Firebase's generic hosted confirmation page, which was a
  // dead end that never told anyone to come back and log in. The password-reset
  // email uses the same trick.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode");
    const urlMode = params.get("mode");
    if (!oobCode || (urlMode !== "verifyEmail" && urlMode !== "resetPassword")) {
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);

    if (urlMode === "verifyEmail") {
      applyEmailVerificationCode(oobCode)
        .then(() => {
          setMode("login");
          setNotice("Email verified! Sign in below to continue.");
        })
        .catch((err) => {
          setMode("login");
          setError(err instanceof ApiError ? err.message : "That verification link is invalid or has expired.");
        });
      return;
    }

    verifyPasswordResetCode(oobCode)
      .then((email) => {
        setResetOobCode(oobCode);
        setResetEmail(email);
        setMode("resetPassword");
      })
      .catch((err) => {
        setMode("login");
        setError(err instanceof ApiError ? err.message : "That reset link is invalid or has expired.");
      });
  }, [applyEmailVerificationCode, verifyPasswordResetCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const isSignUp = mode === "signup";
    if (isSignUp && !displayName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (isSignUp && (!identifierOrEmail.trim() || !identifierOrEmail.includes("@"))) {
      setError("Enter a valid email.");
      return;
    }
    if (!isSignUp && !identifierOrEmail.trim()) {
      setError("Enter your email or display name.");
      return;
    }
    if (password.trim().length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      if (isSignUp) {
        const result = await signUp(displayName, identifierOrEmail, password);
        if (result.status === "verify_email") {
          setMode("checkEmail");
        }
      } else {
        await signIn(identifierOrEmail, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleResend() {
    setResendState("sending");
    try {
      await resendVerification();
      setResendState("sent");
    } catch {
      setResendState("idle");
      setError("Could not resend the verification email. Try again in a moment.");
    }
  }

  async function handleForgotPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifierOrEmail.trim()) {
      setError("Enter your email or display name.");
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordReset(identifierOrEmail);
      setResetSent(true);
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleResetPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 6) {
      setError("Use at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!resetOobCode) {
      setError("That reset link is invalid or has expired. Request a new one below.");
      return;
    }
    try {
      await confirmPasswordReset(resetOobCode, password);
      setPassword("");
      setConfirmPassword("");
      setResetOobCode(null);
      setResetEmail(null);
      setMode("login");
      setNotice("Password reset! Sign in below with your new password.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  if (mode === "forgotPassword") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <BrandLogo size={120} />
          </div>
          <h1 style={{ textAlign: "center", marginBottom: 4 }}>Reset your password</h1>
          <p style={{ textAlign: "center", color: "var(--color-on-surface-variant)", marginTop: 0 }}>
            Enter your email or display name and we'll send you a link to reset your password.
          </p>

          {resetSent ? (
            <p className="chip chip-success" style={{ display: "flex", marginBottom: 12 }}>
              If an account exists, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="field">
                <label htmlFor="forgotIdentifier">Email or display name</label>
                <input
                  id="forgotIdentifier"
                  value={identifierOrEmail}
                  onChange={(e) => setIdentifierOrEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
              {error && <p className="error-text">{error}</p>}
              <button type="submit" className="btn btn-filled" style={{ width: "100%" }} disabled={isSendingReset}>
                {isSendingReset ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              className="btn btn-text"
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
                setResetSent(false);
                setIdentifierOrEmail("");
              }}
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "resetPassword") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <BrandLogo size={120} />
          </div>
          <h1 style={{ textAlign: "center", marginBottom: 4 }}>Choose a new password</h1>
          {resetEmail && (
            <p style={{ textAlign: "center", color: "var(--color-on-surface-variant)", marginTop: 0 }}>
              Resetting the password for <strong>{resetEmail}</strong>.
            </p>
          )}

          <form onSubmit={handleResetPasswordSubmit}>
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="confirmNewPassword">Confirm new password</label>
              <input
                id="confirmNewPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-filled" style={{ width: "100%" }}>
              Reset password
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === "checkEmail") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <BrandLogo size={120} />
          </div>
          <h1 style={{ marginBottom: 4 }}>Check your email</h1>
          <p style={{ color: "var(--color-on-surface-variant)" }}>
            We sent a verification link to <strong>{identifierOrEmail}</strong>. Click it, then come back here and sign
            in. The link expires in 24 hours.
          </p>

          {resendState === "sent" ? (
            <p className="chip chip-success" style={{ display: "inline-flex" }}>
              New link sent
            </p>
          ) : (
            <button className="btn btn-text" onClick={handleResend} disabled={resendState === "sending"}>
              {resendState === "sending" ? "Sending..." : "Didn't get it? Send another link"}
            </button>
          )}

          {error && <p className="error-text">{error}</p>}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-outlined"
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
              }}
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSignUp = mode === "signup";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <BrandLogo size={144} />
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>{isSignUp ? "Create Account" : "Login"}</h1>
        <p style={{ textAlign: "center", color: "var(--color-on-surface-variant)", marginTop: 0 }}>
          Admin manages the season. Competitors sign in to follow fixtures and report scores.
        </p>

        {notice && (
          <p className="chip chip-success" style={{ display: "flex", marginBottom: 12 }}>
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="identifier">{isSignUp ? "Email" : "Email or display name"}</label>
            <input
              id="identifier"
              type={isSignUp ? "email" : "text"}
              value={identifierOrEmail}
              onChange={(e) => setIdentifierOrEmail(e.target.value)}
              autoComplete={isSignUp ? "email" : "username"}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>
          {isSignUp && (
            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {!isSignUp && (
            <div style={{ textAlign: "right", marginTop: -6, marginBottom: 14 }}>
              <button
                type="button"
                className="btn btn-text"
                style={{ padding: 0 }}
                onClick={() => {
                  setMode("forgotPassword");
                  setError(null);
                  setNotice(null);
                  setResetSent(false);
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div>
              <p className="error-text">{error}</p>
              {error.toLowerCase().includes("verify your email") && (
                <button type="button" className="btn btn-text" onClick={handleResend} disabled={resendState === "sending"}>
                  {resendState === "sending"
                    ? "Sending..."
                    : resendState === "sent"
                      ? "New link sent"
                      : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <button type="submit" className="btn btn-filled" style={{ width: "100%" }} disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : isSignUp ? "Create account" : "Login"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button
            className="btn btn-text"
            onClick={() => {
              setMode(isSignUp ? "login" : "signup");
              setError(null);
              setNotice(null);
            }}
          >
            {isSignUp ? "Already have an account? Login" : "Need an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
