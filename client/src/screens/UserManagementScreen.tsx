import { useCallback, useEffect, useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { AssignTeamDialog } from "../components/dialogs/AssignTeamDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { usersApi } from "../api/users";
import { ApiError } from "../api/client";
import type { Profile } from "../api/types";

export function UserManagementScreen() {
  const { teams } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProfiles(await usersApi.list());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const competitors = profiles.filter((p) => p.role === "competitor");

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  async function handleRemove(profile: Profile) {
    setBusyId(profile.id);
    try {
      await usersApi.clearTeam(profile.id);
      await load();
      showSnackbar(`${profile.displayName} was removed from the league.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShellScaffold
      title="League Users"
      actions={
        <button className="btn btn-outlined btn-sm" onClick={load}>
          Refresh users
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>Assign registered competitors to league entries.</p>
        <p style={{ margin: "6px 0 0", color: "var(--color-on-surface-variant)" }}>
          Only the user linked to an entry can submit that entry's score reports. Unassigned users stay outside the
          active league until you add them.
        </p>
      </div>

      {!isLoading && competitors.length === 0 ? (
        <EmptyStateCard title="No competitor accounts yet" message="Ask players to create accounts first. They will appear here for admin assignment." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
          {competitors.map((profile) => (
            <div key={profile.id} className="card" style={{ padding: 14, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{profile.displayName}</div>
                </div>
              </div>
              <div style={{ margin: "10px 0" }}>
                <span className="chip">{profile.teamId ? `Assigned to ${teamName(profile.teamId)}` : "Not in league"}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={teams.length === 0 || busyId === profile.id}
                  onClick={() => setAssignTarget(profile)}
                >
                  {profile.teamId ? "Change entry" : "Assign entry"}
                </button>
                <button className="btn btn-outlined btn-sm" disabled={!profile.teamId || busyId === profile.id} onClick={() => handleRemove(profile)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assignTarget && (
        <AssignTeamDialog
          profile={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            load();
            showSnackbar(`${assignTarget.displayName} was assigned successfully.`);
          }}
        />
      )}
    </AdminShellScaffold>
  );
}
