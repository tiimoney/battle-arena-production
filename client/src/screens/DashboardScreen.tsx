import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { OverviewCard } from "../components/OverviewCard";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BrandLogo } from "../components/BrandLogo";
import { AddTeamDialog } from "../components/dialogs/AddTeamDialog";
import { GenerateFixturesDialog } from "../components/dialogs/GenerateFixturesDialog";
import { ArchiveSeasonDialog } from "../components/dialogs/ArchiveSeasonDialog";
import { ExportLeagueDialog } from "../components/dialogs/ExportLeagueDialog";
import { ImportLeagueDialog } from "../components/dialogs/ImportLeagueDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useAuth } from "../state/AuthContext";
import { useThemeMode } from "../theme/ThemeContext";
import { useSnackbar } from "../state/SnackbarContext";
import { teamsApi } from "../api/teams";
import { scoreReportsApi } from "../api/scoreReports";
import { leagueApi } from "../api/league";
import { ApiError } from "../api/client";
import type { Team } from "../api/types";

type DialogState =
  | null
  | { type: "addTeam" }
  | { type: "editTeam"; team: Team }
  | { type: "generateFixtures" }
  | { type: "archiveSeason" }
  | { type: "exportLeague" }
  | { type: "importLeague" }
  | { type: "deleteTeam"; team: Team }
  | { type: "resetLeague" };

export function DashboardScreen() {
  const navigate = useNavigate();
  const { teams, fixtures, matches, scoreReports, standings, refetchAll, refetchTeams, refetchFixtures, refetchMatches, refetchScoreReports } =
    useLeagueData();
  const { signOut } = useAuth();
  const { isDarkMode, toggleThemeMode } = useThemeMode();
  const { showSnackbar } = useSnackbar();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const completedFixtures = fixtures.filter((f) => f.match).length;
  const totalGoals = matches.reduce((sum, m) => sum + m.scoreA + m.scoreB, 0);

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  async function handleDeleteTeam(team: Team) {
    try {
      await teamsApi.remove(team.id);
      await refetchAll();
      showSnackbar("Entry deleted successfully.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  async function handleResetLeague() {
    try {
      await leagueApi.reset();
      await refetchAll();
      showSnackbar("League data has been reset.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  async function handleApproveReport(reportId: string) {
    setBusyReportId(reportId);
    try {
      await scoreReportsApi.approve(reportId);
      await Promise.all([refetchScoreReports(), refetchMatches(), refetchFixtures()]);
      showSnackbar("Score report approved.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyReportId(null);
    }
  }

  async function handleDeleteReport(reportId: string) {
    setBusyReportId(reportId);
    try {
      await scoreReportsApi.remove(reportId);
      await refetchScoreReports();
      showSnackbar("Score report removed.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <AdminShellScaffold
      title="Dashboard"
      actions={
        <PopupMenu
          trigger={<button className="btn btn-outlined btn-sm">⋯ Dashboard actions</button>}
          items={[
            { label: "Manage users", onSelect: () => navigate("/admin/users") },
            { label: isDarkMode ? "Use light mode" : "Use dark mode", onSelect: toggleThemeMode },
            { label: "Archive season", onSelect: () => setDialog({ type: "archiveSeason" }) },
            { label: "Archived seasons", onSelect: () => navigate("/admin/archives") },
            { label: "Export data", onSelect: () => setDialog({ type: "exportLeague" }) },
            { label: "Import data", onSelect: () => setDialog({ type: "importLeague" }) },
            { label: "Reset active season", onSelect: () => setDialog({ type: "resetLeague" }), destructive: true, divider: true },
            { label: "Sign out", onSelect: () => signOut(), divider: true },
          ]}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <BrandLogo size={84} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ margin: "0 0 6px" }}>League Control Center</h2>
            <p style={{ margin: 0, color: "var(--color-on-surface-variant)" }}>
              Manage entries, players, fixtures, results, memberships, and archived seasons from a single desktop
              workspace.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="chip">{teams.length} Entries</span>
              <span className="chip">{fixtures.length} Fixtures</span>
              <span className="chip">{scoreReports.length} Reports</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-filled" onClick={() => setDialog({ type: "addTeam" })}>
              Add Entry
            </button>
            <button className="btn btn-tonal" onClick={() => navigate("/admin/users")}>
              Manage Users
            </button>
            <button
              className="btn btn-tonal"
              disabled={teams.length < 2}
              onClick={() => setDialog({ type: "generateFixtures" })}
            >
              {fixtures.length > 0 ? "Regenerate Fixtures" : "Generate Fixtures"}
            </button>
          </div>
        </div>

        <OverviewCard entries={teams.length} fixtures={fixtures.length} played={completedFixtures} matches={matches.length} goals={totalGoals} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 10fr) minmax(0, 9fr)", gap: 20 }} className="dashboard-columns">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-tonal" onClick={() => setDialog({ type: "addTeam" })}>
                  Add entry
                </button>
                <button className="btn btn-tonal" disabled={teams.length < 2} onClick={() => navigate("/admin/fixtures")}>
                  Record match
                </button>
                <button className="btn btn-tonal" disabled={teams.length < 2} onClick={() => setDialog({ type: "generateFixtures" })}>
                  {fixtures.length > 0 ? "Regenerate fixtures" : "Generate fixtures"}
                </button>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Pending Score Reports</h3>
              <p style={{ marginTop: -8, color: "var(--color-on-surface-variant)" }}>
                Competitor-submitted scores waiting for confirmation or admin approval.
              </p>
              {scoreReports.length === 0 ? (
                <EmptyStateCard title="No pending reports" message="Score reports will appear here after competitors submit results." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {scoreReports.map((report) => (
                    <div key={report.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--card-border)", borderRadius: 12, padding: 10 }}>
                      <span>
                        {teamName(report.reporterTeamId)} reported {report.teamAScore}-{report.teamBScore}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-tonal btn-sm" disabled={busyReportId === report.id} onClick={() => handleApproveReport(report.id)}>
                          Approve
                        </button>
                        <button
                          className="btn btn-outlined btn-sm"
                          title="Delete report"
                          disabled={busyReportId === report.id}
                          onClick={() => handleDeleteReport(report.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Entries</h3>
              <p style={{ marginTop: -8, color: "var(--color-on-surface-variant)" }}>
                Review each entry type and the players attached to it.
              </p>
              {teams.length === 0 ? (
                <EmptyStateCard title="No entries yet" message="Create your first entry to start building the league." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {teams.map((team) => (
                    <div key={team.id} style={{ border: "1px solid var(--card-border)", borderRadius: 14, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "var(--color-primary-container)",
                              color: "var(--color-on-primary-container)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.8rem",
                            }}
                          >
                            {team.members.length || team.teamSize}
                          </div>
                          <strong>{team.name}</strong>
                        </div>
                        <PopupMenu
                          trigger={<button className="btn btn-text btn-sm">⋯</button>}
                          items={[
                            { label: "Edit entry", onSelect: () => setDialog({ type: "editTeam", team }) },
                            { label: "Delete entry", onSelect: () => setDialog({ type: "deleteTeam", team }), destructive: true },
                          ]}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
                        <span className="chip">{team.entryType === "individual" ? "Individual" : "Team"}</span>
                        <span className="chip">{team.members.length} player(s)</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {team.members.map((m) => (
                          <span key={m.id} className="chip">
                            {m.linkedUserId ? `✓ ${m.name} (system user)` : `${m.name}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ cursor: fixtures.length > 0 ? "pointer" : undefined }} onClick={() => fixtures.length > 0 && navigate("/admin/fixtures")}>
              <h3 style={{ marginTop: 0 }}>Fixtures</h3>
              {fixtures.length === 0 ? (
                <EmptyStateCard title="No fixtures scheduled" message="Generate a round-robin schedule to plan the season." />
              ) : (
                <p>
                  {fixtures.length} fixtures generated
                  <br />
                  {completedFixtures} completed, {fixtures.length - completedFixtures} remaining. Open the fixtures
                  screen to filter by round or date.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>League Table</h3>
          <p style={{ marginTop: -8, color: "var(--color-on-surface-variant)" }}>
            Live standings update automatically as results are recorded.
          </p>
          {teams.length === 0 ? (
            <EmptyStateCard title="League table is empty" message="Standings will appear here after you add entries and record matches." />
          ) : (
            <LeagueTableCard standings={standings} />
          )}
        </div>
      </div>

      {dialog?.type === "addTeam" && <AddTeamDialog onClose={() => setDialog(null)} onSaved={() => { refetchTeams(); showSnackbar("Entry added successfully."); }} />}
      {dialog?.type === "editTeam" && (
        <AddTeamDialog team={dialog.team} onClose={() => setDialog(null)} onSaved={() => { refetchTeams(); showSnackbar("Entry updated successfully."); }} />
      )}
      {dialog?.type === "generateFixtures" && (
        <GenerateFixturesDialog
          hasExistingFixtures={fixtures.length > 0}
          onClose={() => setDialog(null)}
          onGenerated={(count) => {
            refetchFixtures();
            refetchMatches();
            refetchScoreReports();
            showSnackbar(count > 0 ? "Fixture list generated successfully." : "No fixtures were generated.");
          }}
        />
      )}
      {dialog?.type === "archiveSeason" && (
        <ArchiveSeasonDialog
          onClose={() => setDialog(null)}
          onArchived={() => {
            refetchAll();
            showSnackbar("Season archived successfully.");
          }}
        />
      )}
      {dialog?.type === "exportLeague" && <ExportLeagueDialog onClose={() => setDialog(null)} />}
      {dialog?.type === "importLeague" && (
        <ImportLeagueDialog
          onClose={() => setDialog(null)}
          onImported={() => {
            refetchAll();
            showSnackbar("League data imported successfully.");
          }}
        />
      )}
      {dialog?.type === "deleteTeam" && (
        <ConfirmDialog
          title={`Delete ${dialog.team.name}?`}
          body="This deletes the entry and removes all of its matches and fixtures."
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDeleteTeam(dialog.team)}
        />
      )}
      {dialog?.type === "resetLeague" && (
        <ConfirmDialog
          title="Reset active season"
          body="This clears the active teams, fixtures, and match history but keeps archived seasons and your theme preference."
          confirmLabel="Reset"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={handleResetLeague}
        />
      )}
    </AdminShellScaffold>
  );
}
