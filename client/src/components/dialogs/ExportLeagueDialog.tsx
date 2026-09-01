import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { leagueApi } from "../../api/league";
import { useSnackbar } from "../../state/SnackbarContext";

export function ExportLeagueDialog({ onClose }: { onClose: () => void }) {
  const { showSnackbar } = useSnackbar();
  const [json, setJson] = useState<string>("Loading...");

  useEffect(() => {
    leagueApi
      .export()
      .then((data) => setJson(JSON.stringify(data, null, 2)))
      .catch(() => setJson("Failed to load export data."));
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      showSnackbar("League export copied to clipboard.");
    } catch {
      showSnackbar("Could not copy to clipboard.");
    }
  }

  return (
    <Modal title="Export League Data" onClose={onClose} width={560}>
      <pre
        style={{
          maxHeight: 420,
          overflow: "auto",
          background: "var(--color-surface-container)",
          padding: 12,
          borderRadius: 12,
          fontSize: "0.78rem",
          userSelect: "text",
        }}
      >
        {json}
      </pre>
      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-filled" onClick={handleCopy}>
          Copy
        </button>
      </div>
    </Modal>
  );
}
