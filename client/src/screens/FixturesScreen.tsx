import { useEffect, useMemo, useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecordMatchDialog } from "../components/dialogs/RecordMatchDialog";
import { EditFixtureDialog } from "../components/dialogs/EditFixtureDialog";
import { GenerateFixturesDialog } from "../components/dialogs/GenerateFixturesDialog";
import { ShiftFixturesDialog } from "../components/dialogs/ShiftFixturesDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { fixturesApi } from "../api/fixtures";
import { matchesApi } from "../api/matches";
import { ApiError } from "../errors";
import type { Fixture } from "../api/types";

type StatusFilter = "all" | "scheduled" | "played";

type DialogState =
  | null
  | { type: "recordMatch"; fixture: Fixture }
  | { type: "editMatch"; fixture: Fixture }
  | { type: "editFixture"; fixture: Fixture }
  | { type: "generateFixtures" }
  | { type: "shiftFixtures" }
  | { type: "clearFixtures" }
  | { type: "deleteResult"; fixture: Fixture }
  | { type: "deleteFixture"; fixture: Fixture; deleteLinkedMatch: boolean };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function FixturesScreen() {
  const { teams, groups, fixtures: allFixtures, refetchFixtures, refetchMatches, refetchScoreReports } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [groupId, setGroupId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roundFilter, setRoundFilter] = useState<number | "">("");
  const [dateFilter, setDateFilter] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    if (!groupId && groups.length > 0) setGroupId(groups[0].id);
    if (groupId && !groups.some((g) => g.id === groupId)) setGroupId(groups[0]?.id ?? "");
  }, [groups, groupId]);

  const fixtures = useMemo(() => allFixtures.filter((f) => f.groupId === groupId), [allFixtures, groupId]);
  const selectedGroup = groups.find((g) => g.id === groupId);

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }
  function teamLabel(id: string): string {
    const team = teams.find((t) => t.id === id);
    if (!team) return "Unknown entry";
    return `${team.name} (${team.entryType === "individual" ? "Individual player" : `${team.members.length}-player team`})`;
  }

  const rounds = useMemo(() => [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b), [fixtures]);

  const filtered = fixtures.filter((f) => {
    if (statusFilter === "scheduled" && f.match) return false;
    if (statusFilter === "played" && !f.match) return false;
    if (roundFilter !== "" && f.round !== roundFilter) return false;
    if (dateFilter && f.date.slice(0, 10) !== dateFilter) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<number, Fixture[]>();
    for (const fixture of filtered) {
      if (!map.has(fixture.round)) map.set(fixture.round, []);
      map.get(fixture.round)!.push(fixture);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  async function refreshAfterMutation() {
    await Promise.all([refetchFixtures(), refetchMatches(), refetchScoreReports()]);
  }

  async function handleDeleteResult(fixture: Fixture) {
    if (!fixture.match) return setDialog(null);
    try {
      await matchesApi.remove(fixture.match.id);
      await refreshAfterMutation();
      showSnackbar("Match result deleted.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  async function handleDeleteFixture(fixture: Fixture, deleteLinkedMatch: boolean) {
    try {
      await fixturesApi.remove(fixture.groupId, fixture.id, deleteLinkedMatch);
      await refreshAfterMutation();
      showSnackbar("Fixture deleted.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  async function handleClearFixtures() {
    try {
      await fixturesApi.clear(groupId);
      await refreshAfterMutation();
      showSnackbar("Fixture list cleared.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setDialog(null);
    }
  }

  return (
    <AdminShellScaffold
      title="Fixtures"
      actions={
        groupId ? (
          <PopupMenu
            trigger={<button className="btn btn-outlined btn-sm">⋯</button>}
            items={[
              { label: fixtures.length > 0 ? "Regenerate fixtures" : "Generate fixtures", onSelect: () => setDialog({ type: "generateFixtures" }) },
              ...(fixtures.length > 0
                ? [
                    { label: "Shift all dates", onSelect: () => setDialog({ type: "shiftFixtures" }) },
                    { label: "Clear fixtures", onSelect: () => setDialog({ type: "clearFixtures" }), destructive: true },
                  ]
                : []),
            ]}
          />
        ) : null
      }
    >
      {groups.length === 0 ? (
        <EmptyStateCard title="No groups yet" message="Create a group from the Groups screen before generating fixtures." />
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
            {selectedGroup && (
              <span className="chip">
                {selectedGroup.teamCount}
                {selectedGroup.maxTeams !== null ? ` / ${selectedGroup.maxTeams}` : ""} teams
              </span>
            )}
          </div>

          {fixtures.length === 0 ? (
            <EmptyStateCard
              title="No fixtures generated"
              message="Generate a round-robin schedule for this group's teams from the menu above."
            />
          ) : (
            <>
              <div className="card responsive-row" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                <strong>Filters</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["all", "scheduled", "played"] as StatusFilter[]).map((status) => (
                    <button
                      key={status}
                      className={statusFilter === status ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === "all" ? "All" : status === "scheduled" ? "Scheduled" : "Played"}
                    </button>
                  ))}
                </div>
                <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">All rounds</option>
                  {rounds.map((r) => (
                    <option key={r} value={r}>
                      Round {r}
                    </option>
                  ))}
                </select>
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                {dateFilter && (
                  <button className="btn btn-text btn-sm" onClick={() => setDateFilter("")}>
                    Clear date
                  </button>
                )}
              </div>

              {grouped.length === 0 ? (
                <EmptyStateCard title="No fixtures match these filters" message="Try clearing one of the active filters to see more fixtures." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {grouped.map(([round, roundFixtures]) => (
                    <div key={round}>
                      <h3>Round {round}</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
                        {roundFixtures.map((fixture) => (
                          <div key={fixture.id} className="card" style={{ padding: 14 }}>
                            <div
                              style={{ cursor: "pointer" }}
                              onClick={() =>
                                fixture.match
                                  ? setDialog({ type: "editMatch", fixture })
                                  : setDialog({ type: "recordMatch", fixture })
                              }
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <strong>
                                  {teamName(fixture.teamAId)} vs {teamName(fixture.teamBId)}
                                </strong>
                                {fixture.match && (
                                  <span style={{ fontWeight: 700 }}>
                                    {fixture.match.scoreA}-{fixture.match.scoreB}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                                <span className="chip">Leg {fixture.leg}</span>
                                <span className={`chip ${fixture.match ? "chip-success" : ""}`}>
                                  {fixture.match ? "Played" : "Scheduled"}
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                                {formatDate(fixture.date)}
                                <br />
                                {teamLabel(fixture.teamAId)} vs {teamLabel(fixture.teamBId)}
                              </p>
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                              <PopupMenu
                                trigger={<button className="btn btn-text btn-sm">⋯</button>}
                                items={[
                                  {
                                    label: fixture.match ? "Edit result" : "Record result",
                                    onSelect: () =>
                                      setDialog(fixture.match ? { type: "editMatch", fixture } : { type: "recordMatch", fixture }),
                                  },
                                  { label: "Edit fixture", onSelect: () => setDialog({ type: "editFixture", fixture }) },
                                  ...(fixture.match
                                    ? [{ label: "Delete result", onSelect: () => setDialog({ type: "deleteResult", fixture }), destructive: true }]
                                    : []),
                                  { label: "Delete fixture", onSelect: () => setDialog({ type: "deleteFixture", fixture, deleteLinkedMatch: false }), destructive: true, divider: true },
                                  ...(fixture.match
                                    ? [
                                        {
                                          label: "Delete fixture and result",
                                          onSelect: () => setDialog({ type: "deleteFixture", fixture, deleteLinkedMatch: true }),
                                          destructive: true,
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {dialog?.type === "recordMatch" && (
        <RecordMatchDialog
          groupId={dialog.fixture.groupId}
          initial={{ teamAId: dialog.fixture.teamAId, teamBId: dialog.fixture.teamBId, date: dialog.fixture.date, fixtureId: dialog.fixture.id }}
          onClose={() => setDialog(null)}
          onSaved={() => {
            refreshAfterMutation();
            showSnackbar("Fixture result recorded.");
          }}
        />
      )}
      {dialog?.type === "editMatch" && dialog.fixture.match && (
        <RecordMatchDialog
          groupId={dialog.fixture.groupId}
          title="Edit Match Result"
          submitLabel="Update"
          initial={{
            matchId: dialog.fixture.match.id,
            teamAId: dialog.fixture.teamAId,
            teamBId: dialog.fixture.teamBId,
            scoreA: dialog.fixture.match.scoreA,
            scoreB: dialog.fixture.match.scoreB,
            date: dialog.fixture.match.date,
            fixtureId: dialog.fixture.id,
          }}
          onClose={() => setDialog(null)}
          onSaved={() => {
            refreshAfterMutation();
            showSnackbar("Match result updated.");
          }}
        />
      )}
      {dialog?.type === "editFixture" && (
        <EditFixtureDialog
          fixture={dialog.fixture}
          onClose={() => setDialog(null)}
          onSaved={() => {
            refetchFixtures();
            showSnackbar("Fixture updated.");
          }}
        />
      )}
      {dialog?.type === "generateFixtures" && groupId && (
        <GenerateFixturesDialog
          groupId={groupId}
          hasExistingFixtures={fixtures.length > 0}
          onClose={() => setDialog(null)}
          onGenerated={() => refreshAfterMutation()}
        />
      )}
      {dialog?.type === "shiftFixtures" && groupId && (
        <ShiftFixturesDialog
          groupId={groupId}
          onClose={() => setDialog(null)}
          onShifted={() => {
            refetchFixtures();
            showSnackbar("Fixture dates shifted successfully.");
          }}
        />
      )}
      {dialog?.type === "clearFixtures" && (
        <ConfirmDialog
          title="Clear fixtures"
          body="This removes the generated fixture list but keeps teams and recorded matches."
          confirmLabel="Clear"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={handleClearFixtures}
        />
      )}
      {dialog?.type === "deleteResult" && (
        <ConfirmDialog
          title="Delete result"
          body="This removes the recorded result and reopens the fixture as scheduled."
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDeleteResult(dialog.fixture)}
        />
      )}
      {dialog?.type === "deleteFixture" && (
        <ConfirmDialog
          title="Delete fixture"
          body={
            dialog.deleteLinkedMatch
              ? "This removes both the fixture and its recorded result."
              : "This removes the fixture. Any recorded result will be kept in match history as an unlinked match."
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDeleteFixture(dialog.fixture, dialog.deleteLinkedMatch)}
        />
      )}
    </AdminShellScaffold>
  );
}
