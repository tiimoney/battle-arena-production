import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LeagueTableCard } from "../components/LeagueTableCard";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../state/AuthContext";
import { useLeagueData } from "../state/LeagueDataContext";
import { computeStandings } from "../state/standings";
import "./StandingsScreen.css";

// A bare, full-screen "put this on a TV/projector" view -- no admin shell, no
// header, no menu, nothing but the table (plus one small way back), for both
// admin and competitor accounts (this route requires being signed in like every
// other page, so the browser showing it needs to stay logged in). Sized to fill
// a 1920x1080 display without its own scrollbar for a normal-sized league; a
// table with enough rows to overflow that still scrolls internally rather than
// breaking the full-screen layout. Which group to show is picked via a
// "?group=<id>" URL param instead of an on-screen control, so there's nothing
// else to click -- defaults to the first group if omitted or invalid. A small
// on-screen picker only appears when there's more than one group AND no group
// was pinned via the URL, since with a single group there's nothing to choose
// anyway.
const POLL_INTERVAL_MS = 5000;

export function StandingsScreen() {
  const { profile } = useAuth();
  const { teams, groups, matches, tournamentSettings, refetchTeams, refetchMatches, refetchGroups } = useLeagueData();

  const pinnedGroupId = useMemo(() => new URLSearchParams(window.location.search).get("group"), []);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (groups.length === 0) return;
    const pinnedIsValid = pinnedGroupId && groups.some((g) => g.id === pinnedGroupId);
    if (pinnedIsValid) {
      setGroupId(pinnedGroupId);
      return;
    }
    if (!groupId || !groups.some((g) => g.id === groupId)) {
      setGroupId(groups[0].id);
    }
  }, [groups, groupId, pinnedGroupId]);

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

  const showGroupPicker = groups.length > 1 && !pinnedGroupId;
  const activeGroupName = groups.find((g) => g.id === groupId)?.name;

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3vh 3vw",
        boxSizing: "border-box",
        overflow: "hidden",
        // The page background and the card background are both near-white (near-black
        // in dark mode) by design elsewhere in the app -- fine when a sidebar/header
        // provides contrast, but on this chrome-free page that reads as "no
        // background at all". A soft brand-colored backdrop gives it some depth.
        background: "radial-gradient(ellipse at 50% -10%, var(--color-primary-container) 0%, var(--color-background) 55%)",
      }}
    >
      <Link
        to={profile?.role === "admin" ? "/admin" : "/"}
        className="btn btn-text btn-sm"
        style={{ position: "absolute", top: "2vh", left: "2vw" }}
      >
        ← Dashboard
      </Link>

      {groups.length === 0 ? (
        <EmptyStateCard title="No groups yet" message="Standings appear here once an admin creates a group and teams join it." />
      ) : (
        <div style={{ width: "100%", maxWidth: 1600, display: "flex", flexDirection: "column", gap: "1.5vh", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <BrandLogo size={48} />
            <h1 style={{ margin: 0, fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}>
              {tournamentSettings.name || "League"} — {activeGroupName}
            </h1>
            {showGroupPicker && (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                style={{ fontSize: "1rem" }}
                aria-label="Select group"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="card standings-kiosk-table" style={{ overflow: "auto", minHeight: 0 }}>
            <LeagueTableCard standings={standings} />
          </div>
        </div>
      )}
    </div>
  );
}
