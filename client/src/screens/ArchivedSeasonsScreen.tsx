import { useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { PopupMenu } from "../components/PopupMenu";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { archivesApi } from "../api/archives";
import { ApiError } from "../api/client";
import type { ArchivedSeason } from "../api/types";

type DialogState = null | { type: "restore"; archive: ArchivedSeason } | { type: "delete"; archive: ArchivedSeason };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function ArchivedSeasonsScreen() {
  const { archives, refetchArchives, refetchAll } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);

  async function handleRestore(archive: ArchivedSeason) {
    setBusy(true);
    try {
      await archivesApi.restore(archive.id);
      await refetchAll();
      showSnackbar(`"${archive.name}" restored to the active season.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  async function handleDelete(archive: ArchivedSeason) {
    setBusy(true);
    try {
      await archivesApi.remove(archive.id);
      await refetchArchives();
      showSnackbar("Archive deleted.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  return (
    <AdminShellScaffold title="Archived Seasons">
      {archives.length === 0 ? (
        <EmptyStateCard title="No archived seasons" message="Archive a completed season from the home screen to keep a snapshot." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 12 }}>
          {archives.map((archive) => (
            <div key={archive.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <strong>{archive.name}</strong>
                <PopupMenu
                  trigger={<button className="btn btn-text btn-sm">⋯</button>}
                  items={[
                    { label: "Restore to active season", onSelect: () => setDialog({ type: "restore", archive }) },
                    { label: "Delete archive", onSelect: () => setDialog({ type: "delete", archive }), destructive: true },
                  ]}
                />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                {formatDate(archive.archivedAt)}
                <br />
                {archive.teams.length} teams, {archive.fixtures.length} fixtures, {archive.matches.length} matches
              </p>
            </div>
          ))}
        </div>
      )}

      {dialog?.type === "restore" && (
        <ConfirmDialog
          title="Restore archived season"
          body={`This replaces the active league with "${dialog.archive.name}".`}
          confirmLabel={busy ? "Restoring..." : "Restore"}
          onCancel={() => setDialog(null)}
          onConfirm={() => handleRestore(dialog.archive)}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          title="Delete archive"
          body={`Delete "${dialog.archive.name}" permanently?`}
          confirmLabel={busy ? "Deleting..." : "Delete"}
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => handleDelete(dialog.archive)}
        />
      )}
    </AdminShellScaffold>
  );
}
