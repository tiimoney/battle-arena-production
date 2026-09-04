import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { settingsApi } from "../../api/settings";
import { ApiError } from "../../errors";

function toInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function fromInputValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function TournamentSettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((settings) => {
        setName(settings.name);
        setMaxTeamSize(toInputValue(settings.maxTeamSize));
      })
      .catch(() => setError("Could not load current settings."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSubmit() {
    setError(null);
    const parsedMaxTeamSize = fromInputValue(maxTeamSize);
    if (Number.isNaN(parsedMaxTeamSize)) {
      setError("Enter a whole number, or leave the field blank for no limit.");
      return;
    }

    setIsSaving(true);
    try {
      await settingsApi.update({ name, maxTeamSize: parsedMaxTeamSize });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Tournament Settings" onClose={onClose}>
      <p style={{ marginTop: 0, color: "var(--color-on-surface-variant)" }}>
        The name shows throughout the app. The number of teams is capped per group instead of tournament-wide --
        set that from the Groups screen.
      </p>

      {isLoading ? (
        <p style={{ color: "var(--color-on-surface-variant)" }}>Loading...</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="tournamentName">Tournament name</label>
            <input
              id="tournamentName"
              placeholder="e.g. Summer Cup 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="maxTeamSize">Max players per team</label>
            <input
              id="maxTeamSize"
              type="number"
              min={1}
              placeholder="No limit"
              value={maxTeamSize}
              onChange={(e) => setMaxTeamSize(e.target.value)}
            />
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving || isLoading} onClick={handleSubmit}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
}
