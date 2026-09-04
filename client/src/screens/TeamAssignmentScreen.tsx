import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { PopupMenu } from "../components/PopupMenu";
import { ProfileSettingsDialog } from "../components/dialogs/ProfileSettingsDialog";
import { SupportDialog } from "../components/dialogs/SupportDialog";
import { useAuth } from "../state/AuthContext";
import { useLeagueData } from "../state/LeagueDataContext";
import { ApiError } from "../errors";
import { teamsApi } from "../api/teams";
import type { EntryType, Team } from "../api/types";

type Panel = null | { kind: "createTeam" } | { kind: "createIndividual" } | { kind: "join"; team: Team };

export function TeamAssignmentScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const { teams, tournamentSettings: settings, isLoading, refetchTeams } = useLeagueData();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [entryName, setEntryName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);

  const openTeams = teams.filter(
    (t) => t.entryType === "team" && (settings.maxTeamSize === null || t.members.length < settings.maxTeamSize),
  );
  const teamCount = teams.filter((t) => t.entryType === "team").length;

  function openPanel(next: Panel) {
    setError(null);
    setEntryName(next?.kind === "createIndividual" ? profile?.displayName ?? "" : "");
    setPanel(next);
  }

  async function handleJoin(team: Team) {
    setError(null);
    setIsSaving(true);
    try {
      await teamsApi.joinTeam(team.id);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      await refetchTeams();
    } finally {
      setIsSaving(false);
      setPanel(null);
    }
  }

  async function handleCreate(entryType: EntryType) {
    setError(null);
    if (!entryName.trim()) {
      setError("Enter a name for your entry.");
      return;
    }
    setIsSaving(true);
    try {
      await teamsApi.registerNewEntry(entryName, entryType);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
      setPanel(null);
    }
  }

  return (
    <div>
      <header className="admin-header" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <h1 className="admin-header-title" style={{ fontSize: "1.1rem" }}>
          {settings.name ? `Register for ${settings.name}` : "Register for the Tournament"}
        </h1>
        <div className="admin-header-actions">
          <PopupMenu
            trigger={<button className="btn btn-text">⋯</button>}
            items={[
              { label: "My profile", onSelect: () => setShowProfileSettings(true) },
              { label: "Report an issue", onSelect: () => setShowSupportDialog(true) },
              { label: "Sign out", onSelect: () => signOut() },
            ]}
          />
        </div>
      </header>

      {showProfileSettings && <ProfileSettingsDialog onClose={() => setShowProfileSettings(false)} />}
      {showSupportDialog && <SupportDialog onClose={() => setShowSupportDialog(false)} />}

      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <BrandLogo size={88} />
          </div>
          <h2 style={{ marginBottom: 6 }}>Join or create an entry to take part</h2>
          <p style={{ color: "var(--color-on-surface-variant)", margin: 0 }}>
            Pick an existing team with an open spot, start a new team of your own, or register as an individual
            player. You can only be part of one entry at a time.
          </p>
          {error && <p className="error-text">{error}</p>}
        </div>

        {isLoading ? (
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--color-on-surface-variant)" }}>Loading entries...</p>
          </div>
        ) : (
          <>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Open teams</h3>
                <span className="chip">
                  {teamCount} team{teamCount === 1 ? "" : "s"}
                </span>
              </div>
              {openTeams.length === 0 ? (
                <p style={{ color: "var(--color-on-surface-variant)", marginTop: 10 }}>
                  No teams with an open spot right now.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 10, marginTop: 12 }}>
                  {openTeams.map((team) => (
                    <div key={team.id} className="card" style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{team.name}</div>
                      <div style={{ fontSize: "0.85rem", color: "var(--color-on-surface-variant)", margin: "4px 0 10px" }}>
                        {team.members.length}
                        {settings.maxTeamSize !== null ? ` / ${settings.maxTeamSize}` : ""} player
                        {team.members.length === 1 ? "" : "s"}
                      </div>
                      <button
                        className="btn btn-tonal btn-sm"
                        disabled={isSaving}
                        onClick={() => handleJoin(team)}
                        style={{ width: "100%" }}
                      >
                        Join this team
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Or register a new entry</h3>

              {panel?.kind === "createTeam" || panel?.kind === "createIndividual" ? (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="entryName">{panel.kind === "createTeam" ? "Team name" : "Your entry name"}</label>
                  <input id="entryName" value={entryName} onChange={(e) => setEntryName(e.target.value)} autoFocus />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn btn-text" onClick={() => setPanel(null)} disabled={isSaving}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-filled"
                      disabled={isSaving}
                      onClick={() => handleCreate(panel.kind === "createTeam" ? "team" : "individual")}
                    >
                      {isSaving ? "Registering..." : "Register"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-tonal" onClick={() => openPanel({ kind: "createTeam" })}>
                    Create a new team
                  </button>
                  <button className="btn btn-outlined" onClick={() => openPanel({ kind: "createIndividual" })}>
                    Register as an individual
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
