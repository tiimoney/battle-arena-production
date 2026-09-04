import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PopupMenu } from "../components/PopupMenu";
import { AssignTeamDialog } from "../components/dialogs/AssignTeamDialog";
import { useLeagueData } from "../state/LeagueDataContext";
import { useSnackbar } from "../state/SnackbarContext";
import { usersApi } from "../api/users";
import { authApi, type PendingSignUp } from "../api/auth";
import { formatRelativeDate } from "../utils/relativeDate";
import { ApiError } from "../errors";
import type { Profile } from "../api/types";
import "./UserManagementScreen.css";

type StatusFilter = "all" | "assigned" | "unassigned" | "pending";

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All",
  assigned: "Assigned",
  unassigned: "Unassigned",
  pending: "Pending sign-ups",
};

const PAGE_SIZE = 12;

// Pending sign-ups (started registering, never verified their email -- see
// authApi.listPendingSignUps) share this table with real profiles rather than
// living in a separate section, so one status filter covers both.
type UserRow = { kind: "profile"; profile: Profile } | { kind: "pending"; pending: PendingSignUp };

function relativeCell(iso: string | undefined) {
  if (!iso) {
    return <span title="Not tracked (account predates this feature)">—</span>;
  }
  return <span title={new Date(iso).toLocaleString()}>{formatRelativeDate(iso)}</span>;
}

export function UserManagementScreen() {
  const { teams } = useLeagueData();
  const { showSnackbar } = useSnackbar();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Profile | null>(null);
  const [removeAccountTarget, setRemoveAccountTarget] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<PendingSignUp[]>([]);
  const [isPendingLoading, setIsPendingLoading] = useState(true);
  const [busyPendingName, setBusyPendingName] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PendingSignUp | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProfiles(await usersApi.list());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setIsPendingLoading(true);
    try {
      setPending(await authApi.listPendingSignUps());
    } finally {
      setIsPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadPending();
  }, [load, loadPending]);

  const competitors = profiles.filter((p) => p.role === "competitor");

  function teamName(id: string): string {
    return teams.find((t) => t.id === id)?.name ?? "Unknown entry";
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matchesQuery = (row: UserRow): boolean => {
      if (!query) return true;
      if (row.kind === "profile") {
        return (
          row.profile.displayName.toLowerCase().includes(query) ||
          row.profile.email.toLowerCase().includes(query) ||
          (row.profile.teamId ? teamName(row.profile.teamId).toLowerCase().includes(query) : false)
        );
      }
      return row.pending.email.toLowerCase().includes(query) || row.pending.normalizedName.toLowerCase().includes(query);
    };

    if (statusFilter === "pending") {
      return pending.map((p): UserRow => ({ kind: "pending", pending: p })).filter(matchesQuery);
    }

    const rows: UserRow[] = competitors
      .filter((profile) => {
        if (statusFilter === "assigned") return !!profile.teamId;
        if (statusFilter === "unassigned") return !profile.teamId;
        return true;
      })
      .map((profile) => ({ kind: "profile", profile }));

    if (statusFilter === "all") {
      rows.push(...pending.map((p): UserRow => ({ kind: "pending", pending: p })));
    }

    return rows.filter(matchesQuery);
  }, [competitors, pending, search, statusFilter, teams]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalCount = competitors.length + pending.length;

  async function handleUnassign(profile: Profile) {
    setBusyId(profile.id);
    try {
      await usersApi.clearTeam(profile.id);
      await load();
      showSnackbar(`${profile.displayName} was unassigned from their entry.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleDisabled(profile: Profile) {
    setBusyId(profile.id);
    try {
      await usersApi.setDisabled(profile.id, !profile.disabled);
      await load();
      showSnackbar(profile.disabled ? `${profile.displayName} can sign in again.` : `${profile.displayName} was deactivated.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveAccount(profile: Profile) {
    setBusyId(profile.id);
    try {
      await usersApi.remove(profile.id);
      await load();
      showSnackbar(`${profile.displayName}'s account was removed.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
      setRemoveAccountTarget(null);
    }
  }

  async function handleRemovePending(entry: PendingSignUp) {
    setBusyPendingName(entry.normalizedName);
    try {
      await authApi.removePendingSignUp(entry.normalizedName);
      await loadPending();
      showSnackbar(`Freed up the name reserved by ${entry.email}.`);
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyPendingName(null);
      setRemoveTarget(null);
    }
  }

  return (
    <AdminShellScaffold
      title="League Users"
      actions={
        <button
          className="btn btn-outlined btn-sm"
          onClick={() => {
            load();
            loadPending();
          }}
        >
          Refresh users
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>Assign registered competitors to league entries.</p>
        <p style={{ margin: "6px 0 0", color: "var(--color-on-surface-variant)" }}>
          Only the user linked to an entry can submit that entry's score reports. Unassigned users stay outside the
          active league until you add them. Pending sign-ups started registering but haven't verified their email yet.
        </p>
      </div>

      {!isLoading && !isPendingLoading && totalCount === 0 ? (
        <EmptyStateCard title="No competitor accounts yet" message="Ask players to create accounts first. They will appear here for admin assignment." />
      ) : (
        <>
          <div className="card responsive-row" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <strong>Filters</strong>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["all", "assigned", "unassigned", "pending"] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  className={statusFilter === status ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
                  onClick={() => setStatusFilter(status)}
                >
                  {STATUS_LABEL[status]}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="filter-input"
              placeholder="Search name, email, or entry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span style={{ color: "var(--color-on-surface-variant)", fontSize: "0.85rem" }}>
              {filtered.length} of {totalCount} account{totalCount === 1 ? "" : "s"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyStateCard title="No accounts match your filters" message="Try clearing the search or switching the status filter." />
          ) : (
            <div className="card users-table-scroll" style={{ padding: 0 }}>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Entry</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Last login</th>
                    <th className="users-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) =>
                    row.kind === "profile" ? (
                      <tr key={row.profile.id} className={row.profile.disabled ? "users-row-inactive" : undefined}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="users-table-avatar">{row.profile.displayName.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="users-table-name">{row.profile.displayName}</div>
                              <div className="users-table-email">{row.profile.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`chip ${row.profile.teamId ? "chip-success" : ""}`}>
                            {row.profile.teamId ? teamName(row.profile.teamId) : "Not in league"}
                          </span>
                        </td>
                        <td>
                          {row.profile.removedAt ? (
                            <span className="chip chip-warning">Removed</span>
                          ) : row.profile.disabled ? (
                            <span className="chip chip-warning">Deactivated</span>
                          ) : (
                            <span className="chip chip-success">Verified</span>
                          )}
                        </td>
                        <td>{relativeCell(row.profile.createdAt)}</td>
                        <td>{relativeCell(row.profile.lastLoginAt)}</td>
                        <td className="users-table-actions">
                          <PopupMenu
                            trigger={
                              <button
                                className="btn btn-outlined btn-sm"
                                aria-label={`Actions for ${row.profile.displayName}`}
                                disabled={busyId === row.profile.id}
                              >
                                ⋯
                              </button>
                            }
                            items={[
                              {
                                label: row.profile.teamId ? "Change entry" : "Assign entry",
                                onSelect: () => setAssignTarget(row.profile),
                                disabled: teams.length === 0 || !!row.profile.removedAt,
                              },
                              {
                                label: "Unassign",
                                onSelect: () => handleUnassign(row.profile),
                                disabled: !row.profile.teamId,
                              },
                              {
                                label: row.profile.disabled ? "Reactivate" : "Deactivate",
                                onSelect: () => handleToggleDisabled(row.profile),
                                disabled: !!row.profile.removedAt,
                                divider: true,
                              },
                              {
                                label: "Remove account",
                                onSelect: () => setRemoveAccountTarget(row.profile),
                                disabled: !!row.profile.removedAt,
                                destructive: true,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.pending.normalizedName} className="users-row-inactive">
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="users-table-avatar">{row.pending.email.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="users-table-name">{row.pending.email}</div>
                              <div className="users-table-email">Reserved "{row.pending.normalizedName}"</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="chip">—</span>
                        </td>
                        <td>
                          <span className="chip chip-warning">Not verified</span>
                        </td>
                        <td>{relativeCell(row.pending.createdAt)}</td>
                        <td>—</td>
                        <td className="users-table-actions">
                          <PopupMenu
                            trigger={
                              <button
                                className="btn btn-outlined btn-sm"
                                aria-label={`Actions for ${row.pending.email}`}
                                disabled={busyPendingName === row.pending.normalizedName}
                              >
                                ⋯
                              </button>
                            }
                            items={[
                              {
                                label: "Remove",
                                onSelect: () => setRemoveTarget(row.pending),
                                destructive: true,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button
                className="btn btn-outlined btn-sm"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span style={{ fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn btn-outlined btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {assignTarget && (
        <AssignTeamDialog
          profile={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            load();
            showSnackbar(`${assignTarget.displayName} was assigned successfully.`);
          }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove pending sign-up?"
          body={`This frees up the name "${removeTarget.normalizedName}" reserved by ${removeTarget.email}. Their account isn't deleted -- they can still verify and finish signing up, just under a new name if this one's taken by then.`}
          confirmLabel={busyPendingName === removeTarget.normalizedName ? "Removing..." : "Remove"}
          danger
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => handleRemovePending(removeTarget)}
        />
      )}

      {removeAccountTarget && (
        <ConfirmDialog
          title="Remove this account?"
          body={`This app can't delete ${removeAccountTarget.displayName}'s login itself, but it will permanently block them from signing in or playing, clear them from their entry's roster, and free up their display name for someone else to use. This can't be undone from the app.`}
          confirmLabel={busyId === removeAccountTarget.id ? "Removing..." : "Remove account"}
          danger
          onCancel={() => setRemoveAccountTarget(null)}
          onConfirm={() => handleRemoveAccount(removeAccountTarget)}
        />
      )}
    </AdminShellScaffold>
  );
}
