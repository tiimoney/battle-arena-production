import { useState } from "react";
import { Modal } from "../Modal";
import { groupsApi } from "../../api/groups";
import { ApiError } from "../../errors";
import { useLeagueData } from "../../state/LeagueDataContext";
import type { Group } from "../../api/types";

export function ManageGroupTeamsDialog({ group, onClose, onChanged }: { group: Group; onClose: () => void; onChanged: () => void }) {
  const { teams } = useLeagueData();
  const [error, setError] = useState<string | null>(null);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  async function toggle(teamId: string, isMember: boolean) {
    setError(null);
    setBusyTeamId(teamId);
    try {
      if (isMember) {
        await groupsApi.removeTeam(group.id, teamId);
      } else {
        await groupsApi.addTeam(group.id, teamId);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyTeamId(null);
    }
  }

  return (
    <Modal title={`Manage Teams — ${group.name}`} onClose={onClose} width={520}>
      <p style={{ marginTop: 0, color: "var(--color-on-surface-variant)" }}>
        {group.teamCount}
        {group.maxTeams !== null ? ` / ${group.maxTeams}` : ""} teams in this group. Adding a team here bypasses the
        cap -- it only blocks competitors self-joining once the group is full.
      </p>

      {teams.length === 0 ? (
        <p style={{ color: "var(--color-on-surface-variant)" }}>No entries exist yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
          {teams.map((team) => {
            const isMember = team.groupIds.includes(group.id);
            return (
              <label
                key={team.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: busyTeamId ? "default" : "pointer",
                }}
              >
                <span>
                  {team.name}{" "}
                  <span style={{ color: "var(--color-on-surface-variant)", fontSize: "0.8rem" }}>
                    ({team.entryType === "individual" ? "Individual" : `${team.members.length}-player team`})
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={isMember}
                  disabled={busyTeamId === team.id}
                  onChange={() => toggle(team.id, isMember)}
                />
              </label>
            );
          })}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-filled" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
