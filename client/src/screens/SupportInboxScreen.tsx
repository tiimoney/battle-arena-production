import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShellScaffold } from "../components/AdminShellScaffold";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSnackbar } from "../state/SnackbarContext";
import { supportApi } from "../api/support";
import { formatRelativeDate } from "../utils/relativeDate";
import { ApiError } from "../errors";
import type { SupportCategory, SupportStatus, SupportTicket } from "../api/types";

type StatusFilter = "open" | "resolved" | "all";

const CATEGORY_LABEL: Record<SupportCategory, string> = {
  issue: "Issue",
  suggestion: "Suggestion",
  question: "Question",
};

export function SupportInboxScreen() {
  const { showSnackbar } = useSnackbar();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [deleteTarget, setDeleteTarget] = useState<SupportTicket | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setTickets(await supportApi.list());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return tickets;
    return tickets.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  const openCount = tickets.filter((t) => t.status === "open").length;

  async function handleSetStatus(ticket: SupportTicket, status: SupportStatus) {
    setBusyId(ticket.id);
    try {
      await supportApi.setStatus(ticket.id, status);
      await load();
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(ticket: SupportTicket) {
    setBusyId(ticket.id);
    try {
      await supportApi.remove(ticket.id);
      await load();
      showSnackbar("Support ticket removed.");
    } catch (err) {
      showSnackbar(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <AdminShellScaffold
      title="Support Inbox"
      actions={
        <button className="btn btn-outlined btn-sm" onClick={load}>
          Refresh
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0 }}>Issues, suggestions, and questions logged by admins and competitors.</p>
        <p style={{ margin: "6px 0 0", color: "var(--color-on-surface-variant)" }}>
          {openCount} open ticket{openCount === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="card responsive-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <strong>Filter</strong>
        <div style={{ display: "flex", gap: 6 }}>
          {(["open", "resolved", "all"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              className={statusFilter === status ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "All" : status === "open" ? "Open" : "Resolved"}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && filtered.length === 0 ? (
        <EmptyStateCard
          title={statusFilter === "open" ? "No open tickets" : "Nothing here"}
          message='Submissions from the "Report an issue" menu item will show up here.'
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((ticket) => (
            <div key={ticket.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span className="chip">{CATEGORY_LABEL[ticket.category]}</span>
                    <span className={`chip ${ticket.status === "resolved" ? "chip-success" : "chip-warning"}`}>
                      {ticket.status === "resolved" ? "Resolved" : "Open"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700 }}>{ticket.userDisplayName}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-on-surface-variant)" }}>
                    {ticket.userEmail} · <span title={new Date(ticket.createdAt).toLocaleString()}>{formatRelativeDate(ticket.createdAt)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busyId === ticket.id}
                    onClick={() => handleSetStatus(ticket, ticket.status === "open" ? "resolved" : "open")}
                  >
                    {ticket.status === "open" ? "Mark resolved" : "Reopen"}
                  </button>
                  <button className="btn btn-outlined btn-sm" disabled={busyId === ticket.id} onClick={() => setDeleteTarget(ticket)}>
                    Delete
                  </button>
                </div>
              </div>
              <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{ticket.message}</p>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this ticket?"
          body="This permanently removes the submission. This can't be undone."
          confirmLabel={busyId === deleteTarget.id ? "Deleting..." : "Delete"}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </AdminShellScaffold>
  );
}
