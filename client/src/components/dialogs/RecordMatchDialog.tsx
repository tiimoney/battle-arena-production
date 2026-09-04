import { useState } from "react";
import { Modal } from "../Modal";
import { matchesApi } from "../../api/matches";
import { ApiError } from "../../errors";
import { useLeagueData } from "../../state/LeagueDataContext";

export interface RecordMatchInitial {
  matchId?: string;
  teamAId?: string;
  teamBId?: string;
  scoreA?: number;
  scoreB?: number;
  date?: string;
  fixtureId?: string | null;
}

export function RecordMatchDialog({
  groupId,
  initial,
  title = "Record Match",
  submitLabel = "Save",
  onClose,
  onSaved,
}: {
  groupId: string;
  initial?: RecordMatchInitial;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { teams: allTeams } = useLeagueData();
  const teams = allTeams.filter((t) => t.groupIds.includes(groupId));
  const [teamAId, setTeamAId] = useState(initial?.teamAId ?? "");
  const [teamBId, setTeamBId] = useState(initial?.teamBId ?? "");
  const [scoreA, setScoreA] = useState(initial?.scoreA !== undefined ? String(initial.scoreA) : "");
  const [scoreB, setScoreB] = useState(initial?.scoreB !== undefined ? String(initial.scoreB) : "");
  const [date, setDate] = useState((initial?.date ?? new Date().toISOString()).slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!teamAId) return setError("Select Entry A.");
    if (!teamBId) return setError("Select Entry B.");
    if (teamAId === teamBId) return setError("Entries must be different.");

    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === "" || Number.isNaN(parsedA)) return setError("Enter a score.");
    if (scoreB.trim() === "" || Number.isNaN(parsedB)) return setError("Enter a score.");
    if (parsedA < 0 || parsedB < 0) return setError("Score cannot be negative.");

    setIsSaving(true);
    try {
      const input = {
        groupId,
        teamAId,
        teamBId,
        scoreA: parsedA,
        scoreB: parsedB,
        date: new Date(date).toISOString(),
        fixtureId: initial?.fixtureId,
      };
      if (initial?.matchId) {
        await matchesApi.update(initial.matchId, input);
      } else {
        await matchesApi.create(input);
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
    <Modal title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="team-a">Entry A</label>
        <select id="team-a" value={teamAId} onChange={(e) => setTeamAId(e.target.value)}>
          <option value="">Select an entry</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.entryType === "individual" ? "Individual player" : `${t.members.length}-player team`})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="team-b">Entry B</label>
        <select id="team-b" value={teamBId} onChange={(e) => setTeamBId(e.target.value)}>
          <option value="">Select an entry</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.entryType === "individual" ? "Individual player" : `${t.members.length}-player team`})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="score-a">Score A</label>
          <input id="score-a" type="number" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="score-b">Score B</label>
          <input id="score-b" type="number" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="match-date">Match date</label>
        <input id="match-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : submitLabel}
        </button>
      </div>
    </Modal>
  );
}
