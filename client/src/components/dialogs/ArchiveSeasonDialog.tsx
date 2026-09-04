import { useState } from "react";
import { Modal } from "../Modal";
import { archivesApi } from "../../api/archives";
import { ApiError } from "../../errors";

function defaultArchiveName(): string {
  const today = new Date();
  const formatted = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `Season ${formatted}`;
}

export function ArchiveSeasonDialog({
  groupId,
  groupName,
  onClose,
  onArchived,
}: {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [name, setName] = useState(defaultArchiveName());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Enter an archive name.");
      return;
    }
    setIsSaving(true);
    try {
      await archivesApi.create({ groupId, name });
      onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Archive Episode" onClose={onClose}>
      <p style={{ marginTop: 0, color: "var(--color-on-surface-variant)" }}>
        This ends "{groupName}": its current teams, fixtures, and results are saved as an archived season, and the
        group is removed. Teams stay registered and keep playing in any other groups they're in.
      </p>
      <div className="field">
        <label htmlFor="archive-name">Archive name</label>
        <input id="archive-name" placeholder="e.g. Summer League 2026" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Archiving..." : "Archive"}
        </button>
      </div>
    </Modal>
  );
}
