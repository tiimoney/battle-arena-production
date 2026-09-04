import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { PopupMenu } from "../components/PopupMenu";
import { useAuth } from "../state/AuthContext";
import { useLeagueData } from "../state/LeagueDataContext";
import { computeStandings } from "../state/standings";
import { useThemeMode } from "../theme/ThemeContext";

// A dedicated full-page table for both admin and competitor accounts, reachable from
// either shell. Polls in the background so it stays live without a manual refresh --
// simple interval polling rather than a websocket/SSE push, since a league table
// changes at most a few times a minute and this is far less infrastructure for the
// same felt result.
const POLL_INTERVAL_MS = 5000;

export function StandingsScreen() {
  const { profile, signOut } = useAuth();
  const { teams, groups, matches, refetchTeams, refetchMatches, refetchGroups } = useLeagueData();
  const { toggleThemeMode } = useThemeMode();
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (!groupId && groups.length > 0) setGroupId(groups[0].id);
    if (groupId && !groups.some((g) => g.id === groupId)) setGroupId(groups[0]?.id ?? "");
  }, [groups, groupId]);

  useEffect(() => {
    const id = setInterval(() => {
      refetchTeams();
      refetchMatches();
      refetchGroups();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetchTeams, refetchMatches, refetchGroups]);

  const groupTeams = useMemo(() => teams.filter((t) => t.groupIds.includes(groupId)), [teams, groupId]);
  const groupMatches = useMemo(() => matches.filter((m) => m.groupId === groupId), [matches, groupId]);
  const standings = useMemo(() => computeStandings(groupTeams, groupMatches), [groupTeams, groupMatches]);

  const content =
    groups.length === 0 ? (
      <EmptyStateCard title="No groups yet" message="Standings appear here once an admin creates a group and teams join it." />
    ) : (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>League Table</h2>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <p style={{ color: "var(--color-on-surface-variant)", marginTop: 0, marginBottom: 16 }}>
          Live standings — this page refreshes itself automatically.
        </p>
        <LeagueTableCard standings={standings} />
      </div>
    );

  if (profile?.role === "admin") {
    return <AdminShellScaffold title="Standings">{content}</AdminShellScaffold>;
  }

  return (
    <div>
      <header className="admin-header" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <Link to="/" className="btn btn-text">
          ← Back
        </Link>
        <h1 className="admin-header-title" style={{ fontSize: "1.1rem" }}>
          Standings
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

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24 }}>{content}</div>
    </div>
  );
}
