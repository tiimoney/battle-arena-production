import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { PopupMenu } from "../components/PopupMenu";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { SubmitScoreReportDialog } from "../components/dialogs/SubmitScoreReportDialog";
import { ProfileSettingsDialog } from "../components/dialogs/ProfileSettingsDialog";
import { SupportDialog } from "../components/dialogs/SupportDialog";
import { RenameTeamDialog } from "../components/dialogs/RenameTeamDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../state/AuthContext";
import { useLeagueData } from "../state/LeagueDataContext";
import { computeStandings } from "../state/standings";
import { useThemeMode } from "../theme/ThemeContext";
import { useSnackbar } from "../state/SnackbarContext";
import { groupsApi } from "../api/groups";
import { teamsApi } from "../api/teams";
import { ApiError } from "../errors";
import type { Fixture, Group, MatchResult, ScoreReport, Team } from "../api/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function GroupSection({
  group,
  myTeam,
  teams,
  fixtures,
  matches,
  scoreReports,
  onReport,
  onLeave,
  isLeaving,
}: {
  group: Group;
  myTeam: Team;
  teams: Team[];
  fixtures: Fixture[];
  matches: MatchResult[];
  scoreReports: ScoreReport[];
  onReport: (fixture: Fixture) => void;
  onLeave: () => void;
  isLeaving: boolean;
}) {
  const { profile } = useAuth();

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  function statusFor(fixture: Fixture): string {
    if (fixture.match) {
      return `Approved result: ${fixture.match.scoreA}-${fixture.match.scoreB}`;
    }
    const reports = scoreReports.filter((r) => r.fixtureId === fixture.id);
    if (reports.length === 0) return "No score reported yet.";
    if (reports.length === 1) {
      return reports[0].reporterUserId === profile?.id
        ? "Your report is in. Waiting for the opponent."
        : "The opponent has reported a score. Confirm it or submit your own.";
    }
    return "Scores do not match yet. The admin will review if needed.";
  }

  const groupFixtures = fixtures.filter((f) => f.groupId === group.id);
  const myFixtures = groupFixtures.filter((f) => f.teamAId === myTeam.id || f.teamBId === myTeam.id);
  const nextFixture = myFixtures.find((f) => !f.match) ?? null;

  const groupTeams = teams.filter((t) => t.groupIds.includes(group.id));
  const groupMatches = matches.filter((m) => m.groupId === group.id);
  const standings = computeStandings(groupTeams, groupMatches);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{group.name}</h2>
        <button className="btn btn-outlined btn-sm" disabled={isLeaving} onClick={onLeave}>
          {isLeaving ? "Leaving..." : "Leave group"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Next Match</h3>
        {nextFixture ? (
          <p>
            {teamName(nextFixture.teamAId === myTeam.id ? nextFixture.teamBId : nextFixture.teamAId)}
            <br />
            {formatDate(nextFixture.date)}
          </p>
        ) : (
          <p>No upcoming unplayed fixture.</p>
        )}
      </div>

      <div>
        <h3>My Fixtures</h3>
        {myFixtures.length === 0 ? (
          <div className="card">
            <p style={{ margin: 0 }}>No fixtures are available for your entry yet in this group.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
            {myFixtures.map((fixture) => {
              const myReport = scoreReports.find((r) => r.fixtureId === fixture.id && r.reporterUserId === profile?.id);
              const canReport = !fixture.match;
              return (
                <div key={fixture.id} className="card" style={{ padding: 14 }}>
                  <strong>
                    {teamName(fixture.teamAId)} vs {teamName(fixture.teamBId)}
                  </strong>
                  <p style={{ margin: "4px 0", fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                    Round {fixture.round} | {formatDate(fixture.date)}
                  </p>
                  <p style={{ margin: "4px 0" }}>{statusFor(fixture)}</p>
                  {!fixture.match && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
                      {scoreReports
                        .filter((r) => r.fixtureId === fixture.id)
                        .map((r) => (
                          <span key={r.id} className="chip">
                            {teamName(r.reporterTeamId)}: {r.teamAScore}-{r.teamBScore}
                          </span>
                        ))}
                    </div>
                  )}
                  {canReport && (
                    <button className="btn btn-tonal btn-sm" onClick={() => onReport(fixture)}>
                      {myReport ? "Update report" : "Report score"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>League Table</h3>
          <Link to="/standings" className="btn btn-text btn-sm">
            Full-page view →
          </Link>
        </div>
        <LeagueTableCard standings={standings} />
      </div>
    </div>
  );
}

export function CompetitorHomeScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const {
    teams,
    groups,
    fixtures,
    matches,
    scoreReports,
    tournamentSettings,
    isLoading,
    refetchTeams,
    refetchFixtures,
    refetchMatches,
    refetchScoreReports,
  } = useLeagueData();
  const { toggleThemeMode } = useThemeMode();
  const { showSnackbar } = useSnackbar();
  const [reportFixture, setReportFixture] = useState<Fixture | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const navigate = useNavigate();

  const myTeam = profile?.teamId ? teams.find((t) => t.id === profile.teamId) ?? null : null;

  // isLoading distinguishes "your team hasn't been fetched yet" from "your account
  // really isn't linked to an entry" -- without this check, every competitor briefly
  // saw the no-entry message on every login while the initial teams fetch was still
  // in flight. A genuinely missing team (profile.teamId points at an entry that no
  // longer exists) needs an admin to fix, since only they can reassign or clear it --
  // so this offers Report an issue as a direct path to ask for that, using the
  // support-ticket feature.
  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto", borderTopColor: "var(--color-primary)", borderColor: "var(--color-outline-variant)" }} />
      </div>
    );
  }

  if (!myTeam) {
    return (
      <div style={{ padding: 40, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 8 }}>No entry assigned</h2>
        <p style={{ color: "var(--color-on-surface-variant)" }}>
          Your account isn't linked to a league entry right now -- this can happen if your entry was removed. Ask the
          admin to reassign you, or send them a message below.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-filled" onClick={() => setShowSupportDialog(true)}>
            Report an issue
          </button>
          <button className="btn btn-outlined" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
        {showSupportDialog && <SupportDialog onClose={() => setShowSupportDialog(false)} />}
      </div>
    );
  }

  const myGroups = groups.filter((g) => myTeam.groupIds.includes(g.id));
  const availableGroups = groups.filter(
    (g) => !myTeam.groupIds.includes(g.id) && (g.maxTeams === null || g.teamCount < g.maxTeams),
  );

  async function refreshAfterReport() {
    await Promise.all([refetchFixtures(), refetchMatches(), refetchScoreReports()]);
  }

  async function handleJoin(groupId: string) {
    setBusyGroupId(groupId);
    try {
      await groupsApi.joinGroup(groupId);
      await refetchTeams();
      showSnackbar("Joined the group successfully.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleLeave(groupId: string) {
    setBusyGroupId(groupId);
    try {
      await groupsApi.leaveGroup(groupId);
      await refetchTeams();
      showSnackbar("Left the group.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyGroupId(null);
    }
  }

  // On success profile.teamId becomes null, and App routes back to
  // TeamAssignmentScreen to join or create another entry.
  async function handleLeaveTeam() {
    setShowLeaveConfirm(false);
    setIsLeavingTeam(true);
    try {
      await teamsApi.leaveTeam();
      await Promise.all([refetchTeams(), refreshProfile()]);
      showSnackbar("You left the team.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
      setIsLeavingTeam(false);
    }
  }

  const canLeaveTeam = myTeam.entryType === "team" && myTeam.members.length > 1;

  return (
    <div>
      <header className="admin-header" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <h1 className="admin-header-title" style={{ fontSize: "1.1rem" }}>
          {tournamentSettings.name || "My League"}
        </h1>
        <div className="admin-header-actions">
          <PopupMenu
            trigger={<button className="btn btn-text">⋯</button>}
            items={[
              { label: "My profile", onSelect: () => setShowProfileSettings(true) },
              { label: "Report an issue", onSelect: () => setShowSupportDialog(true) },
              { label: "Full-page standings", onSelect: () => navigate("/standings") },
              { label: "Toggle theme", onSelect: toggleThemeMode },
              { label: "Sign out", onSelect: () => signOut() },
            ]}
          />
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 28 }}>
        <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <BrandLogo size={88} />
          <div>
            <h2 style={{ margin: "0 0 6px" }}>Your Entry Dashboard</h2>
            <p style={{ margin: 0, color: "var(--color-on-surface-variant)" }}>
              {myTeam.name} is registered as {myTeam.entryType === "individual" ? "Individual player" : `${myTeam.members.length}-player team`}. You're
              in {myGroups.length} group{myGroups.length === 1 ? "" : "s"} right now.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn btn-tonal btn-sm" onClick={() => setShowRenameDialog(true)}>
                {myTeam.entryType === "team" ? "Rename team" : "Rename entry"}
              </button>
              {canLeaveTeam && (
                <button className="btn btn-outlined btn-sm" disabled={isLeavingTeam} onClick={() => setShowLeaveConfirm(true)}>
                  {isLeavingTeam ? "Leaving..." : "Leave team"}
                </button>
              )}
            </div>
          </div>
        </div>

        {myGroups.length === 0 ? (
          <EmptyStateCard title="Not in any group yet" message="Join a group below to see fixtures and standings for it." />
        ) : (
          myGroups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              myTeam={myTeam}
              teams={teams}
              fixtures={fixtures}
              matches={matches}
              scoreReports={scoreReports}
              onReport={setReportFixture}
              onLeave={() => handleLeave(group.id)}
              isLeaving={busyGroupId === group.id}
            />
          ))
        )}

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Join a group</h3>
          {availableGroups.length === 0 ? (
            <p style={{ margin: 0, color: "var(--color-on-surface-variant)" }}>
              No open groups to join right now.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 10 }}>
              {availableGroups.map((group) => (
                <div key={group.id} className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{group.name}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-on-surface-variant)", margin: "4px 0 10px" }}>
                    {group.teamCount}
                    {group.maxTeams !== null ? ` / ${group.maxTeams}` : ""} teams
                  </div>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busyGroupId === group.id}
                    onClick={() => handleJoin(group.id)}
                    style={{ width: "100%" }}
                  >
                    {busyGroupId === group.id ? "Joining..." : "Join group"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showProfileSettings && <ProfileSettingsDialog onClose={() => setShowProfileSettings(false)} />}
      {showSupportDialog && <SupportDialog onClose={() => setShowSupportDialog(false)} />}
      {showRenameDialog && (
        <RenameTeamDialog
          team={myTeam}
          onClose={() => setShowRenameDialog(false)}
          onSaved={() => {
            refetchTeams();
            showSnackbar("Name updated.");
          }}
        />
      )}
      {showLeaveConfirm && (
        <ConfirmDialog
          title={`Leave ${myTeam.name}?`}
          body="You'll be taken off the roster and can then join or create another entry. The team keeps its fixtures and results."
          confirmLabel="Leave team"
          danger
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={handleLeaveTeam}
        />
      )}

      {reportFixture && (
        <SubmitScoreReportDialog
          fixture={reportFixture}
          teamA={teams.find((t) => t.id === reportFixture.teamAId)}
          teamB={teams.find((t) => t.id === reportFixture.teamBId)}
          existingReport={scoreReports.find((r) => r.fixtureId === reportFixture.id && r.reporterUserId === profile?.id)}
          onClose={() => setReportFixture(null)}
          onSubmitted={refreshAfterReport}
        />
      )}
    </div>
  );
}
