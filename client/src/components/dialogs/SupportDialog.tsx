import { useState } from "react";
import { Modal } from "../Modal";
import { supportApi } from "../../api/support";
import { ApiError } from "../../errors";
import type { SupportCategory } from "../../api/types";

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "issue", label: "Report an issue" },
  { value: "suggestion", label: "Suggest something" },
  { value: "question", label: "Ask a question" },
];

export function SupportDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<SupportCategory>("issue");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!message.trim()) {
      setError("Enter a message before submitting.");
      return;
    }
    setIsSubmitting(true);
    try {
      await supportApi.submit(category, message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Modal title="Thanks!" onClose={onClose} width={440}>
        <p>Your message has been sent to the league admin. They'll follow up if needed.</p>
        <div className="modal-actions">
          <button className="btn btn-filled" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Contact the league admin" onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="supportCategory">What's this about?</label>
          <select id="supportCategory" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="supportMessage">Message</label>
          <textarea
            id="supportMessage"
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue, suggestion, or question..."
          />
        </div>
        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
      </div>
      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </button>
        <button className="btn btn-filled" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send"}
        </button>
      </div>
    </Modal>
  );
}
