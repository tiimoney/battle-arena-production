import { useState } from "react";
import { Modal } from "../Modal";
import { usersApi } from "../../api/users";
import { ApiError } from "../../api/client";
import { useLeagueData } from "../../state/LeagueDataContext";
import type { Profile } from "../../api/types";

function sizeLabel(entryType: string, memberCount: number): string {
  return entryType === "individual" ? "Individual player" : `${memberCount}-player team`;
}

export function AssignTeamDialog({ profile, onClose, onAssigned }: { profile: Profile; onClose: () => void; onAssigned: () => void }) {
  const { teams } = useLeagueData();
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (!teamId) return;
    setError(null);
    setIsSaving(true);
    try {
      await usersApi.assignTeam(profile.id, teamId);
      onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Assign Entry" onClose={onClose}>
      <div className="field">
        <label htmlFor="assign-team">Entry</label>
        <select id="assign-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Select an entry</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({sizeLabel(t.entryType, t.members.length)})
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving || !teamId} onClick={handleSubmit}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
}
