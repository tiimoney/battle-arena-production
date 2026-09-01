import { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { PopupMenu } from "../components/PopupMenu";
import { SubmitScoreReportDialog } from "../components/dialogs/SubmitScoreReportDialog";
import { useAuth } from "../state/AuthContext";
import { useLeagueData } from "../state/LeagueDataContext";
import { useThemeMode } from "../theme/ThemeContext";
import type { Fixture } from "../api/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function CompetitorHomeScreen() {
  const { profile, signOut } = useAuth();
  const { teams, fixtures, scoreReports, standings, refetchFixtures, refetchMatches, refetchScoreReports } = useLeagueData();
  const { toggleThemeMode } = useThemeMode();
  const [reportFixture, setReportFixture] = useState<Fixture | null>(null);

  const myTeam = profile?.teamId ? teams.find((t) => t.id === profile.teamId) ?? null : null;

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  if (!myTeam) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>No entry assigned.</p>
      </div>
    );
  }

  const myFixtures = fixtures.filter((f) => f.teamAId === myTeam.id || f.teamBId === myTeam.id);
  const nextFixture = myFixtures.find((f) => !f.match) ?? null;

  async function refreshAfterReport() {
    await Promise.all([refetchFixtures(), refetchMatches(), refetchScoreReports()]);
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

  return (
    <div>
      <header className="admin-header" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <h1 className="admin-header-title" style={{ fontSize: "1.1rem" }}>
          My League
        </h1>
        <div className="admin-header-actions">
          <PopupMenu
            trigger={<button className="btn btn-text">⋯</button>}
            items={[
              { label: "Toggle theme", onSelect: toggleThemeMode },
              { label: "Sign out", onSelect: () => signOut() },
            ]}
          />
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <BrandLogo size={88} />
          <div>
            <h2 style={{ margin: "0 0 6px" }}>Your Entry Dashboard</h2>
            <p style={{ margin: 0, color: "var(--color-on-surface-variant)" }}>
              {myTeam.name} is registered as {myTeam.entryType === "individual" ? "Individual player" : `${myTeam.members.length}-player team`}. Track
              your next fixture, submit scores, and keep an eye on the table from here.
            </p>
          </div>
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
              <p style={{ margin: 0 }}>No fixtures are available for your entry yet.</p>
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
                      <button className="btn btn-tonal btn-sm" onClick={() => setReportFixture(fixture)}>
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
          <h3 style={{ marginTop: 0 }}>League Table</h3>
          <LeagueTableCard standings={standings} />
        </div>
      </div>

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
