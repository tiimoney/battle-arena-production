import { useState } from "react";
import { Modal } from "../Modal";
import { fixturesApi } from "../../api/fixtures";
import { ApiError } from "../../api/client";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GenerateFixturesDialog({
  hasExistingFixtures,
  onClose,
  onGenerated,
}: {
  hasExistingFixtures: boolean;
  onClose: () => void;
  onGenerated: (count: number) => void;
}) {
  const [startDate, setStartDate] = useState(todayIso());
  const [daysBetweenRounds, setDaysBetweenRounds] = useState("7");
  const [isDoubleRoundRobin, setIsDoubleRoundRobin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    const days = Number(daysBetweenRounds);
    if (!Number.isFinite(days)) {
      setError("Enter a valid number.");
      return;
    }
    if (days <= 0) {
      setError("Days between rounds must be greater than 0.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await fixturesApi.generate({
        startDate: new Date(startDate).toISOString(),
        daysBetweenRounds: days,
        isDoubleRoundRobin,
      });
      onGenerated(result.count);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={hasExistingFixtures ? "Regenerate Fixtures" : "Generate Fixtures"} onClose={onClose}>
      {hasExistingFixtures && (
        <p style={{ color: "var(--color-on-surface-variant)" }}>This replaces the current generated fixture list.</p>
      )}

      <div className="field">
        <label htmlFor="start-date">Start date</label>
        <input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="days-between">Days between rounds</label>
        <input
          id="days-between"
          type="number"
          placeholder="e.g. 7"
          value={daysBetweenRounds}
          onChange={(e) => setDaysBetweenRounds(e.target.value)}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={isDoubleRoundRobin} onChange={(e) => setIsDoubleRoundRobin(e.target.checked)} />
        <span>
          <strong>Double round robin</strong>
          <br />
          <span style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>
            Generate home and away legs for every pairing.
          </span>
        </span>
      </label>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Generating..." : "Generate"}
        </button>
      </div>
    </Modal>
  );
}
