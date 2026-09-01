import { useEffect, useState, type FormEvent } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../state/AuthContext";
import { ApiError } from "../api/client";

type Mode = "login" | "signup" | "checkEmail";

export function AuthScreen() {
  const { signIn, signUp, resendVerification, isSubmitting } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  // Login accepts either the account's email or its (unique) display name; sign-up
  // always needs a real email address (verification is sent there).
  const [identifierOrEmail, setIdentifierOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("emailVerified")) {
      setNotice("Email verified! You're signed in.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("emailVerifyError")) {
      setError("That verification link is invalid or has expired. Request a new one below.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
      await resendVerification(identifierOrEmail);
      setResendState("sent");
    } catch {
      setResendState("idle");
      setError("Could not resend the verification email. Try again in a moment.");
    }
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
            We sent a verification link to <strong>{identifierOrEmail}</strong>. Click it to finish creating your account. The
            link expires in 24 hours.
          </p>

          {resendState === "sent" ? (
            <p className="chip" style={{ display: "inline-flex" }}>
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
          <p className="chip" style={{ display: "flex", marginBottom: 12 }}>
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
