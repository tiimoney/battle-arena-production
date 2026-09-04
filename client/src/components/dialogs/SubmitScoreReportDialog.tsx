import { useState } from "react";
import { Modal } from "../Modal";
import { scoreReportsApi } from "../../api/scoreReports";
import { ApiError } from "../../errors";
import type { Fixture, ScoreReport, Team } from "../../api/types";

export function SubmitScoreReportDialog({
  fixture,
  teamA,
  teamB,
  existingReport,
  onClose,
  onSubmitted,
}: {
  fixture: Fixture;
  teamA: Team | undefined;
  teamB: Team | undefined;
  existingReport?: ScoreReport;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [scoreA, setScoreA] = useState(existingReport ? String(existingReport.teamAScore) : "");
  const [scoreB, setScoreB] = useState(existingReport ? String(existingReport.teamBScore) : "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function parseScore(value: string): number | null {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  }

  async function handleSubmit() {
    setError(null);
    const parsedA = parseScore(scoreA);
    const parsedB = parseScore(scoreB);
    if (parsedA === null || parsedB === null) {
      setError("Enter a valid score.");
      return;
    }

    setIsSaving(true);
    try {
      await scoreReportsApi.submit({ groupId: fixture.groupId, fixtureId: fixture.id, scoreA: parsedA, scoreB: parsedB });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Report Score" onClose={onClose}>
      <p>
        {teamA?.name ?? "Entry A"} vs {teamB?.name ?? "Entry B"}
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="report-score-a">{teamA?.name ?? "Entry A"}</label>
          <input id="report-score-a" type="number" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="report-score-b">{teamB?.name ?? "Entry B"}</label>
          <input id="report-score-b" type="number" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : "Submit"}
        </button>
      </div>
    </Modal>
  );
}
