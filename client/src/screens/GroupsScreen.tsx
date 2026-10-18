import { useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { GroupFormDialog } from "../components/dialogs/GroupFormDialog";
import { ManageGroupTeamsDialog } from "../components/dialogs/ManageGroupTeamsDialog";
import { ArchiveSeasonDialog } from "../components/dialogs/ArchiveSeasonDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { groupsApi } from "../api/groups";
import { ApiError } from "../errors";
import type { Group } from "../api/types";

type DialogState =
  | null
  | { type: "create" }
  | { type: "edit"; group: Group }
  | { type: "manageTeams"; group: Group }
  | { type: "archive"; group: Group }
  | { type: "delete"; group: Group };

export function GroupsScreen() {
  const { groups, teams, fixtures, refetchAll, refetchGroups } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);

  function teamsIn(groupId: string) {
    return teams.filter((t) => t.groupIds.includes(groupId));
  }

  function fixtureCount(groupId: string) {
    return fixtures.filter((f) => f.groupId === groupId).length;
  }

  // Feeds the Scoreboard tool's roster import (Stream Overlay/Scoreboard) --
  // a plain client-side read of data already in memory via useLeagueData(),
  // no new Firestore access. Kept inline rather than in api/ since it's a
  // pure local transform + browser download, not a backend call.
  function handleExportRoster(group: Group) {
    const roster = {
      groupId: group.id,
      groupName: group.name,
      exportedAt: new Date().toISOString(),
      teams: teamsIn(group.id).map((team) => ({
        id: team.id,
        name: team.name,
        members: team.members.map((member) => member.name),
      })),
    };

    const slug = group.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
    const blob = new Blob([JSON.stringify(roster, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-roster.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showSnackbar(`Exported ${roster.teams.length} team${roster.teams.length === 1 ? "" : "s"} from "${group.name}".`);
  }

  async function handleDelete(group: Group) {
    setBusy(true);
    try {
      await groupsApi.remove(group.id);
      await refetchAll();
      showSnackbar(`"${group.name}" was deleted.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  return (
    <AdminShellScaffold
      title="Groups"
      actions={
        <button className="btn btn-filled btn-sm" onClick={() => setDialog({ type: "create" })}>
          Create group
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>
          Each group runs as its own independent mini-league ("episode") -- its own fixtures and its own standings.
          A team can join more than one group at once.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyStateCard title="No groups yet" message="Create a group, add teams to it, then generate its fixtures from the Fixtures screen." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
          {groups.map((group) => (
            <div key={group.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <strong>{group.name}</strong>
                <PopupMenu
                  trigger={<button className="btn btn-text btn-sm">⋯</button>}
                  items={[
                    { label: "Manage teams", onSelect: () => setDialog({ type: "manageTeams", group }) },
                    { label: "Export roster", onSelect: () => handleExportRoster(group) },
                    { label: "Edit group", onSelect: () => setDialog({ type: "edit", group }) },
                    { label: "Archive episode", onSelect: () => setDialog({ type: "archive", group }) },
                    { label: "Delete group", onSelect: () => setDialog({ type: "delete", group }), destructive: true, divider: true },
                  ]}
                />
              </div>
              <div style={{ display: "flex", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
                <span className="chip">
                  {group.teamCount}
                  {group.maxTeams !== null ? ` / ${group.maxTeams}` : ""} teams
                </span>
                <span className="chip">{fixtureCount(group.id)} fixtures</span>
              </div>
              {teamsIn(group.id).length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>No teams yet.</p>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {teamsIn(group.id).map((team) => (
                    <span key={team.id} className="chip">
                      {team.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {dialog?.type === "create" && (
        <GroupFormDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            refetchGroups();
            showSnackbar("Group created successfully.");
          }}
        />
      )}
      {dialog?.type === "edit" && (
        <GroupFormDialog
          group={dialog.group}
          onClose={() => setDialog(null)}
          onSaved={() => {
            refetchGroups();
            showSnackbar("Group updated successfully.");
          }}
        />
      )}
      {dialog?.type === "manageTeams" && (
        <ManageGroupTeamsDialog group={dialog.group} onClose={() => setDialog(null)} onChanged={() => refetchAll()} />
      )}
      {dialog?.type === "archive" && (
        <ArchiveSeasonDialog
          groupId={dialog.group.id}
          groupName={dialog.group.name}
          onClose={() => setDialog(null)}
          onArchived={() => {
            refetchAll();
            showSnackbar("Episode archived successfully.");
          }}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.group.name}?`}
          body="This removes the group, its fixtures, and its results. Teams stay registered and keep playing in any other groups they're in. Nothing is saved to Archives."
          confirmLabel={busy ? "Deleting..." : "Delete"}
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDelete(dialog.group)}
        />
      )}
    </AdminShellScaffold>
  );
}
