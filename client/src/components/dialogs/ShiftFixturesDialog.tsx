import { useState } from "react";
import { Modal } from "../Modal";
import { fixturesApi } from "../../api/fixtures";
import { ApiError } from "../../errors";

export function ShiftFixturesDialog({ groupId, onClose, onShifted }: { groupId: string; onClose: () => void; onShifted: () => void }) {
  const [days, setDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = Number(days);
    if (days.trim() === "" || Number.isNaN(parsed)) {
      setError("Enter a valid number.");
      return;
    }
    if (parsed === 0) {
      setError("Enter a value other than 0.");
      return;
    }

    setIsSaving(true);
    try {
      await fixturesApi.shift(groupId, parsed);
      onShifted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Shift Fixture Dates" onClose={onClose}>
      <div className="field">
        <label htmlFor="shift-days">Shift by days</label>
        <input id="shift-days" type="number" placeholder="Use negative values to move earlier" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Shifting..." : "Shift"}
        </button>
      </div>
    </Modal>
  );
}
