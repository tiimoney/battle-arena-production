import { Modal } from "./Modal";

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{body}</p>
      <div className="modal-actions">
        <button className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button className={danger ? "btn btn-danger" : "btn btn-filled"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
