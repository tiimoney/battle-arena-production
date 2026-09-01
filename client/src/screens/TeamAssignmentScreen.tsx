import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../state/AuthContext";
import { ApiError } from "../api/client";

export function TeamAssignmentScreen() {
  const { refreshProfile, signOut, isSubmitting } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setError(null);
    try {
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <header className="admin-header" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <h1 className="admin-header-title" style={{ fontSize: "1.1rem" }}>
          Waiting For Assignment
        </h1>
        <div className="admin-header-actions">
          <button className="btn btn-text" disabled={isSubmitting} onClick={handleRefresh}>
            Refresh
          </button>
          <button className="btn btn-text" disabled={isSubmitting} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24, display: "flex", justifyContent: "center" }}>
        <div className="card" style={{ maxWidth: 480, textAlign: "center", padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <BrandLogo size={104} />
          </div>
          <h2>Your account is waiting for the admin to add you to the league.</h2>
          <p>
            Only the assigned competitor account for an entry can submit that entry's scores. Ask the admin to link
            your account to a league entry, then use Refresh here.
          </p>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-filled" style={{ marginTop: 20 }} disabled={isSubmitting} onClick={handleRefresh}>
            {isSubmitting ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </div>
    </div>
  );
}
