import { useState } from "react";
import { Modal } from "../Modal";
import { ConfirmDialog } from "../ConfirmDialog";
import { leagueApi } from "../../api/league";
import { ApiError } from "../../api/client";

export function ImportLeagueDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function parsePayload(): unknown | null {
    try {
      const decoded = JSON.parse(text);
      if (typeof decoded !== "object" || decoded === null) {
        setError("Imported data must be a JSON object.");
        return null;
      }
      return decoded;
    } catch {
      setError("Invalid JSON. Paste a valid export.");
      return null;
    }
  }

  async function runImport(mode: "merge" | "replace") {
    setError(null);
    const payload = parsePayload();
    if (payload === null) return;

    setIsSaving(true);
    try {
      await leagueApi.import(payload, mode);
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleImportClick() {
    if (replaceMode) {
      setError(null);
      if (parsePayload() === null) return;
      setShowReplaceConfirm(true);
      return;
    }
    runImport("merge");
  }

  return (
    <>
      <Modal title="Import League Data" onClose={onClose} width={560}>
        <div className="field">
          <label htmlFor="import-json">League data JSON</label>
          <textarea
            id="import-json"
            rows={14}
            placeholder="Paste exported JSON here"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
          />
        </div>

        <p style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>
          By default, import merges into the active league by id -- existing teams, fixtures, matches, and archives
          not present in this file are left untouched.
        </p>

        <div className="card" style={{ borderColor: "var(--color-error)", padding: 14, marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
            <span>
              <strong style={{ color: "var(--color-error)" }}>Danger zone: full replace</strong>
              <br />
              <span style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>
                Wipes the active league (and archives, if included in this file) and replaces it entirely with this
                import. This cannot be undone.
              </span>
            </span>
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button className={replaceMode ? "btn btn-danger" : "btn btn-filled"} disabled={isSaving} onClick={handleImportClick}>
            {isSaving ? "Importing..." : replaceMode ? "Review replace" : "Import"}
          </button>
        </div>
      </Modal>

      {showReplaceConfirm && (
        <ConfirmDialog
          title="Replace the entire league?"
          body="This permanently deletes the current active league (and archives, if this file includes them) and replaces it with the imported data. This cannot be undone."
          confirmLabel="Replace everything"
          danger
          onCancel={() => setShowReplaceConfirm(false)}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            runImport("replace");
          }}
        />
      )}
    </>
  );
}
