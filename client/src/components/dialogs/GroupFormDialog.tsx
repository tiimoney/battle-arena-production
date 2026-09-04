import { useState } from "react";
import { Modal } from "../Modal";
import { groupsApi } from "../../api/groups";
import { ApiError } from "../../errors";
import type { Group } from "../../api/types";

function toInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function fromInputValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function GroupFormDialog({ group, onClose, onSaved }: { group?: Group; onClose: () => void; onSaved: () => void }) {
  const isEditing = Boolean(group);
  const [name, setName] = useState(group?.name ?? "");
  const [maxTeams, setMaxTeams] = useState(toInputValue(group?.maxTeams ?? null));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a group name.");
      return;
    }
    const parsedMaxTeams = fromInputValue(maxTeams);
    if (Number.isNaN(parsedMaxTeams)) {
      setError("Enter a whole number, or leave blank for no limit.");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && group) {
        await groupsApi.update(group.id, { name, maxTeams: parsedMaxTeams });
      } else {
        await groupsApi.create({ name, maxTeams: parsedMaxTeams });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={isEditing ? "Edit Group" : "Create Group"} onClose={onClose}>
      <p style={{ marginTop: 0, color: "var(--color-on-surface-variant)" }}>
        A group runs as its own independent mini-league (an "episode") with its own fixtures and standings. A team
        can belong to more than one group at once.
      </p>
      <div className="field">
        <label htmlFor="group-name">Group name</label>
        <input id="group-name" placeholder="e.g. Group 1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="group-max-teams">Max number of teams</label>
        <input
          id="group-max-teams"
          type="number"
          min={1}
          placeholder="No limit"
          value={maxTeams}
          onChange={(e) => setMaxTeams(e.target.value)}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : isEditing ? "Save" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
