import { useEffect, useMemo, useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecordMatchDialog } from "../components/dialogs/RecordMatchDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { matchesApi } from "../api/matches";
import { ApiError } from "../errors";
import type { MatchResult } from "../api/types";

type DialogState = null | { type: "edit"; match: MatchResult } | { type: "delete"; match: MatchResult };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function MatchHistoryScreen() {
  const { teams, groups, matches: allMatches, refetchMatches, refetchFixtures, refetchScoreReports } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [groupId, setGroupId] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    if (!groupId && groups.length > 0) setGroupId(groups[0].id);
    if (groupId && !groups.some((g) => g.id === groupId)) setGroupId(groups[0]?.id ?? "");
  }, [groups, groupId]);

  const matches = useMemo(() => allMatches.filter((m) => m.groupId === groupId), [allMatches, groupId]);

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }
  function teamLabel(id: string): string {
    const team = teams.find((t) => t.id === id);
    if (!team) return "Unknown entry";
    return `${team.name} (${team.entryType === "individual" ? "Individual player" : `${team.members.length}-player team`})`;
  }

  async function handleDelete(match: MatchResult) {
    try {
      await matchesApi.remove(match.id);
      await Promise.all([refetchMatches(), refetchFixtures(), refetchScoreReports()]);
      showSnackbar("Match result deleted.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  return (
    <AdminShellScaffold title="Match History">
      {groups.length === 0 ? (
        <EmptyStateCard title="No groups yet" message="Create a group from the Groups screen to start recording matches." />
      ) : (
        <>
          <div className="card responsive-row" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <strong>Group</strong>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {matches.length === 0 ? (
            <EmptyStateCard title="No matches recorded" message="Record results from the Fixtures screen to build this group's match history." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 12 }}>
              {matches.map((match) => {
                const resultLabel = match.scoreA === match.scoreB ? "Draw" : `${teamName(match.scoreA > match.scoreB ? match.teamAId : match.teamBId)} won`;
                return (
                  <div key={match.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <strong>
                        {teamName(match.teamAId)} {match.scoreA} - {match.scoreB} {teamName(match.teamBId)}
                      </strong>
                      <PopupMenu
                        trigger={<button className="btn btn-text btn-sm">⋯</button>}
                        items={[
                          { label: "Edit result", onSelect: () => setDialog({ type: "edit", match }) },
                          { label: "Delete result", onSelect: () => setDialog({ type: "delete", match }), destructive: true },
                        ]}
                      />
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                      {formatDate(match.date)}
                      <br />
                      {match.fixtureId && <>Linked to fixture{"\n"}</>}
                      {teamLabel(match.teamAId)} vs {teamLabel(match.teamBId)}
                    </p>
                    <span
                      className={`chip ${match.scoreA === match.scoreB ? "" : "chip-success"}`}
                      style={{ marginTop: 8, display: "inline-block" }}
                    >
                      {resultLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {dialog?.type === "edit" && (
        <RecordMatchDialog
          groupId={dialog.match.groupId}
          title="Edit Match Result"
          submitLabel="Update"
          initial={{
            matchId: dialog.match.id,
            teamAId: dialog.match.teamAId,
            teamBId: dialog.match.teamBId,
            scoreA: dialog.match.scoreA,
            scoreB: dialog.match.scoreB,
            date: dialog.match.date,
            fixtureId: dialog.match.fixtureId,
          }}
          onClose={() => setDialog(null)}
          onSaved={() => {
            refetchMatches();
            refetchFixtures();
            showSnackbar("Match result updated.");
          }}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          title="Delete result"
          body={dialog.match.fixtureId ? "This removes the result and reopens its linked fixture." : "This removes the result from match history."}
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDelete(dialog.match)}
        />
      )}
    </AdminShellScaffold>
  );
}
