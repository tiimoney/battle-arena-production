import { useMemo, useState } from "react";
import { PopupMenu } from "./PopupMenu";
import { EmptyStateCard } from "./EmptyStateCard";
import { formatRelativeDate } from "../utils/relativeDate";
import type { Team } from "../api/types";
import "./EntriesCard.css";

type EntryFilter = "all" | "team" | "individual" | "noGroup";

const FILTER_LABEL: Record<EntryFilter, string> = {
  all: "All",
  team: "Teams",
  individual: "Individuals",
  noGroup: "Not in a group",
};

// Rows shown before "Show all" -- keeps the dashboard scannable as the league grows.
const COLLAPSED_LIMIT = 10;

export function EntriesCard({
  teams,
  groupName,
  onEdit,
  onDelete,
}: {
  teams: Team[];
  groupName: (id: string) => string;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}) {
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return teams.filter((team) => {
      if (filter === "team" && team.entryType !== "team") return false;
      if (filter === "individual" && team.entryType !== "individual") return false;
      if (filter === "noGroup" && team.groupIds.length > 0) return false;
      if (!term) return true;
      return team.name.toLowerCase().includes(term) || team.members.some((m) => m.name.toLowerCase().includes(term));
    });
  }, [teams, filter, search]);

  // Searching or filtering already narrows the list, so only cap the unfiltered view.
  const isNarrowed = filter !== "all" || search.trim() !== "";
  const visible = showAll || isNarrowed ? filtered : filtered.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = filtered.length - visible.length;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Entries</h3>
      {teams.length === 0 ? (
        <EmptyStateCard title="No entries yet" message="Create your first entry to start building the league." />
      ) : (
        <>
          <div className="responsive-row" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(FILTER_LABEL) as EntryFilter[]).map((key) => (
                <button
                  key={key}
                  className={filter === key ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
                  onClick={() => setFilter(key)}
                >
                  {FILTER_LABEL[key]}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="filter-input"
              placeholder="Search entry or player..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span style={{ color: "var(--color-on-surface-variant)", fontSize: "0.85rem" }}>
              {filtered.length} of {teams.length} entr{teams.length === 1 ? "y" : "ies"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyStateCard title="No entries match" message="Try clearing the search or switching the filter." />
          ) : (
            <div className="entries-list">
              {visible.map((team) => {
                const isExpanded = expandedId === team.id;
                return (
                  <div key={team.id} className="entries-row">
                    <div className="entries-row-main">
                      <button
                        className="entries-row-toggle"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedId(isExpanded ? null : team.id)}
                      >
                        <span className="entries-row-caret">{isExpanded ? "▾" : "▸"}</span>
                        <span className="entries-row-name">{team.name}</span>
                        <span className="entries-row-meta">
                          {team.entryType === "individual" ? "Individual" : `Team · ${team.members.length} player${team.members.length === 1 ? "" : "s"}`}
                          {" · "}
                          {team.groupIds.length === 0 ? (
                            <span style={{ color: "var(--color-warning)" }}>No group</span>
                          ) : (
                            team.groupIds.map(groupName).join(", ")
                          )}
                        </span>
                      </button>
                      <PopupMenu
                        trigger={<button className="btn btn-text btn-sm">⋯</button>}
                        items={[
                          { label: "Edit entry", onSelect: () => onEdit(team) },
                          { label: "Delete entry", onSelect: () => onDelete(team), destructive: true },
                        ]}
                      />
                    </div>
                    {isExpanded && (
                      <div className="entries-row-details">
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {team.members.map((m) => (
                            <span key={m.id} className="chip" title={m.joinedAt ? `Joined ${new Date(m.joinedAt).toLocaleString()}` : undefined}>
                              {m.linkedUserId ? `✓ ${m.name}` : m.name}
                            </span>
                          ))}
                        </div>
                        {team.registeredAt && (
                          <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }} title={new Date(team.registeredAt).toLocaleString()}>
                            Registered {formatRelativeDate(team.registeredAt)} · ✓ = has an account
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(hiddenCount > 0 || (showAll && !isNarrowed && filtered.length > COLLAPSED_LIMIT)) && (
            <button className="btn btn-text btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${filtered.length} entries`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
