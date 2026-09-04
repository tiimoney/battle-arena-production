import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AddTeamDialog } from "../components/dialogs/AddTeamDialog";
import { ExportLeagueDialog } from "../components/dialogs/ExportLeagueDialog";
import { ImportLeagueDialog } from "../components/dialogs/ImportLeagueDialog";
import { TournamentSettingsDialog } from "../components/dialogs/TournamentSettingsDialog";
import { ProfileSettingsDialog } from "../components/dialogs/ProfileSettingsDialog";
import { SupportDialog } from "../components/dialogs/SupportDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useAuth } from "../state/AuthContext";
import { useThemeMode } from "../theme/ThemeContext";
import { useSnackbar } from "../state/SnackbarContext";
import { teamsApi } from "../api/teams";
import { scoreReportsApi } from "../api/scoreReports";
import { leagueApi } from "../api/league";
import { computeStandings } from "../state/standings";
import { formatRelativeDate } from "../utils/relativeDate";
import { ApiError } from "../errors";
import type { ScoreReport, Team } from "../api/types";

function formatFixtureDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

type DialogState =
  | null
  | { type: "addTeam" }
  | { type: "editTeam"; team: Team }
  | { type: "exportLeague" }
  | { type: "importLeague" }
  | { type: "tournamentSettings" }
  | { type: "profileSettings" }
  | { type: "support" }
  | { type: "deleteTeam"; team: Team }
  | { type: "resetLeague" };

export function DashboardScreen() {
  const navigate = useNavigate();
  const {
    teams,
    groups,
    fixtures,
    matches,
    scoreReports,
    tournamentSettings,
    refetchAll,
    refetchTeams,
    refetchScoreReports,
    refetchMatches,
    refetchFixtures,
  } = useLeagueData();
  const { signOut } = useAuth();
  const { isDarkMode, toggleThemeMode } = useThemeMode();
  const { showSnackbar } = useSnackbar();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const completedFixtures = fixtures.filter((f) => f.match).length;
  const totalGoals = matches.reduce((sum, m) => sum + m.scoreA + m.scoreB, 0);

  // groups is already sorted by createdAt (oldest first) -- the first group is the
  // "primary" one for the at-a-glance standings/fixtures preview below.
  const primaryGroup = groups[0] ?? null;
  const primaryStandings = useMemo(() => {
    if (!primaryGroup) return [];
    const groupTeams = teams.filter((t) => t.groupIds.includes(primaryGroup.id));
    const groupMatches = matches.filter((m) => m.groupId === primaryGroup.id);
    return computeStandings(groupTeams, groupMatches).slice(0, 3);
  }, [primaryGroup, teams, matches]);

  const upcomingFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => !f.match)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [fixtures],
  );

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  function groupName(id: string): string {
    return groups.find((g) => g.id === id)?.name ?? "Unknown group";
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

  async function handleApproveReport(report: ScoreReport) {
    setBusyReportId(report.id);
    try {
      await scoreReportsApi.approve(report.groupId, report.id);
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
      title={tournamentSettings.name || "Dashboard"}
      actions={
        <PopupMenu
          trigger={
            <button className="btn btn-outlined btn-sm" aria-label="Dashboard actions">
              ⋯
            </button>
          }
          items={[
            { label: "My profile", onSelect: () => setDialog({ type: "profileSettings" }) },
            { label: "Manage users", onSelect: () => navigate("/admin/users") },
            { label: "Manage groups", onSelect: () => navigate("/admin/groups") },
            { label: "Support inbox", onSelect: () => navigate("/admin/support") },
            { label: "Report an issue", onSelect: () => setDialog({ type: "support" }) },
            { label: "Tournament settings", onSelect: () => setDialog({ type: "tournamentSettings" }) },
            { label: isDarkMode ? "Use light mode" : "Use dark mode", onSelect: toggleThemeMode },
            { label: "Archived seasons", onSelect: () => navigate("/admin/archives") },
            { label: "Export data", onSelect: () => setDialog({ type: "exportLeague" }) },
            { label: "Import data", onSelect: () => setDialog({ type: "importLeague" }) },
            { label: "Reset active season", onSelect: () => setDialog({ type: "resetLeague" }), destructive: true, divider: true },
            { label: "Sign out", onSelect: () => signOut(), divider: true },
          ]}
        />
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Active season -- compact stat cards for a season-health-at-a-glance view. */}
        <div>
          <h3 style={{ margin: "0 0 10px" }}>Active season</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div
              className="card"
              style={{ border: "none", background: "var(--color-primary-container)", color: "var(--color-on-primary-container)", padding: 16, minWidth: 220, flex: "1 1 220px" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{tournamentSettings.name || "Untitled season"}</div>
              <div style={{ display: "flex", gap: 14, fontSize: "0.85rem", flexWrap: "wrap" }}>
                <span>{teams.length} entries</span>
                <span>{fixtures.length} fixtures</span>
                <span>{totalGoals} goals</span>
              </div>
            </div>
            <div
              className="card"
              style={{ border: "none", background: "var(--color-success-container)", color: "var(--color-on-success-container)", padding: 16, minWidth: 150, flex: "1 1 150px" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Matches</div>
              <div style={{ fontSize: "0.9rem" }}>{fixtures.length - completedFixtures} pending</div>
            </div>
            <div
              className="card"
              style={{ border: "none", background: "var(--color-warning-container)", color: "var(--color-on-warning-container)", padding: 16, minWidth: 150, flex: "1 1 150px" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Reports</div>
              <div style={{ fontSize: "0.9rem" }}>{scoreReports.length} awaiting</div>
            </div>
          </div>
        </div>

        {scoreReports.length > 0 && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Pending Score Reports</h3>
            <p style={{ marginTop: -8, color: "var(--color-on-surface-variant)" }}>
              Competitor-submitted scores waiting for confirmation or admin approval.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {scoreReports.map((report) => (
                <div
                  key={report.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--card-border)", borderRadius: 10, padding: 10 }}
                >
                  <span>
                    {teamName(report.reporterTeamId)} reported {report.teamAScore}-{report.teamBScore}
                    <span style={{ color: "var(--color-on-surface-variant)" }}> · {groupName(report.groupId)}</span>
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-tonal btn-sm" disabled={busyReportId === report.id} onClick={() => handleApproveReport(report)}>
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
          </div>
        )}

        {/* Next steps -- the actions a league admin most often needs, front and center. */}
        <div>
          <h3 style={{ margin: "0 0 10px" }}>Next steps</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 12 }}>
            <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setDialog({ type: "addTeam" })}>
              <div style={{ fontWeight: 600 }}>⊕ Add entry</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>Create a new team or participant</div>
            </button>
            <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => navigate("/admin/groups")}>
              <div style={{ fontWeight: 600 }}>🗂️ Manage groups</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>Create episodes and assign entries</div>
            </button>
            <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => navigate("/admin/fixtures")}>
              <div style={{ fontWeight: 600 }}>📅 Generate fixtures</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>Create a round-robin schedule</div>
            </button>
            <button className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => navigate("/admin/fixtures")}>
              <div style={{ fontWeight: 600 }}>📊 Record match</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>Log results and scores</div>
            </button>
          </div>
        </div>

        {/* League progress -- standings and what's coming up, side by side. */}
        <div>
          <h3 style={{ margin: "0 0 10px" }}>League progress</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dashboard-columns">
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <h4 style={{ margin: 0 }}>Standings{primaryGroup ? ` — ${primaryGroup.name}` : ""}</h4>
                {primaryGroup && (
                  <Link to="/standings" className="btn btn-text btn-sm">
                    View all →
                  </Link>
                )}
              </div>
              {!primaryGroup ? (
                <EmptyStateCard title="No groups yet" message="Create a group to start tracking standings." />
              ) : primaryStandings.length === 0 ? (
                <p style={{ color: "var(--color-on-surface-variant)" }}>No matches played yet in this group.</p>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <LeagueTableCard standings={primaryStandings} />
                </div>
              )}
              {groups.length > 1 && (
                <p style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)", marginTop: 10, marginBottom: 0 }}>
                  +{groups.length - 1} other group{groups.length - 1 === 1 ? "" : "s"} —{" "}
                  <Link to="/admin/groups">manage groups</Link>
                </p>
              )}
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0 }}>Upcoming fixtures</h4>
              {upcomingFixtures.length === 0 ? (
                <p style={{ color: "var(--color-on-surface-variant)" }}>No unplayed fixtures scheduled.</p>
              ) : (
                <div>
                  {upcomingFixtures.map((fixture, index) => (
                    <div key={fixture.id}>
                      {index > 0 && <hr className="divider" style={{ margin: "10px 0" }} />}
                      <div style={{ fontSize: "0.9rem" }}>
                        {teamName(fixture.teamAId)} vs {teamName(fixture.teamBId)}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>
                        {formatFixtureDate(fixture.date)}
                        {groups.length > 1 ? ` · ${groupName(fixture.groupId)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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
                <div key={team.id} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 12 }}>
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
                    {team.registeredAt && (
                      <span className="chip" title={new Date(team.registeredAt).toLocaleString()}>
                        Registered {formatRelativeDate(team.registeredAt)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {team.members.map((m) => (
                      <span key={m.id} className="chip" title={m.joinedAt ? `Joined ${new Date(m.joinedAt).toLocaleString()}` : undefined}>
                        {m.linkedUserId ? `✓ ${m.name} (system user)` : `${m.name}`}
                      </span>
                    ))}
                  </div>
                  {team.groupIds.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {team.groupIds.map((gid) => (
                        <span key={gid} className="chip chip-accent">
                          {groupName(gid)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dialog?.type === "addTeam" && <AddTeamDialog onClose={() => setDialog(null)} onSaved={() => { refetchTeams(); showSnackbar("Entry added successfully."); }} />}
      {dialog?.type === "editTeam" && (
        <AddTeamDialog team={dialog.team} onClose={() => setDialog(null)} onSaved={() => { refetchTeams(); showSnackbar("Entry updated successfully."); }} />
      )}
      {dialog?.type === "profileSettings" && <ProfileSettingsDialog onClose={() => setDialog(null)} />}
      {dialog?.type === "support" && <SupportDialog onClose={() => setDialog(null)} />}
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
      {dialog?.type === "tournamentSettings" && (
        <TournamentSettingsDialog
          onClose={() => setDialog(null)}
          onSaved={() => showSnackbar("Tournament settings saved.")}
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
