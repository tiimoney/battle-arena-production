import { useState } from "react";
import { Modal } from "../Modal";
import { teamsApi } from "../../api/teams";
import { ApiError } from "../../errors";
import type { Team } from "../../api/types";

export function RenameTeamDialog({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team.name);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a name for your entry.");
      return;
    }
    setIsSaving(true);
    try {
      await teamsApi.renameOwnTeam(name);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={team.entryType === "team" ? "Rename team" : "Rename entry"} onClose={onClose} width={420}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="renameTeamName">Name</label>
        <input id="renameTeamName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose} disabled={isSaving}>
          Cancel
        </button>
        <button className="btn btn-filled" onClick={handleSave} disabled={isSaving || name.trim() === team.name}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
}
