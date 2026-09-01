import { useState } from "react";
import { Modal } from "../Modal";
import { archivesApi } from "../../api/archives";
import { ApiError } from "../../api/client";

function defaultArchiveName(): string {
  const today = new Date();
  const formatted = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `Season ${formatted}`;
}

export function ArchiveSeasonDialog({ onClose, onArchived }: { onClose: () => void; onArchived: () => void }) {
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
      await archivesApi.create({ name, clearCurrentSeason: true });
      onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Archive Season" onClose={onClose}>
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
