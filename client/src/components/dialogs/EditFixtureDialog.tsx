import { useState } from "react";
import { Modal } from "../Modal";
import { fixturesApi } from "../../api/fixtures";
import { ApiError } from "../../api/client";
import { useLeagueData } from "../../state/LeagueDataContext";
import type { Fixture } from "../../api/types";

export function EditFixtureDialog({ fixture, onClose, onSaved }: { fixture: Fixture; onClose: () => void; onSaved: () => void }) {
  const { teams } = useLeagueData();
  const [round, setRound] = useState(String(fixture.round));
  const [teamAId, setTeamAId] = useState(fixture.teamAId);
  const [teamBId, setTeamBId] = useState(fixture.teamBId);
  const [date, setDate] = useState(fixture.date.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsedRound = Number(round);
    if (round.trim() === "" || Number.isNaN(parsedRound)) return setError("Enter a valid round.");
    if (parsedRound <= 0) return setError("Round must be greater than 0.");
    if (!teamAId) return setError("Select Entry A.");
    if (!teamBId) return setError("Select Entry B.");
    if (teamAId === teamBId) return setError("Entries must be different.");

    setIsSaving(true);
    try {
      await fixturesApi.update(fixture.id, {
        round: parsedRound,
        teamAId,
        teamBId,
        date: new Date(date).toISOString(),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Edit Fixture" onClose={onClose}>
      <div className="field">
        <label htmlFor="round">Round</label>
        <input id="round" type="number" value={round} onChange={(e) => setRound(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="fixture-team-a">Entry A</label>
        <select id="fixture-team-a" value={teamAId} onChange={(e) => setTeamAId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="fixture-team-b">Entry B</label>
        <select id="fixture-team-b" value={teamBId} onChange={(e) => setTeamBId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="fixture-date">Fixture date</label>
        <input id="fixture-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <p style={{ color: "var(--color-on-surface-variant)" }}>Leg {fixture.leg}</p>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
}
