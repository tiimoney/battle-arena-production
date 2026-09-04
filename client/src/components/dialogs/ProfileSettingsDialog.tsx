import { useState } from "react";
import { Modal } from "../Modal";
import { useAuth } from "../../state/AuthContext";
import { ApiError } from "../../errors";

export function ProfileSettingsDialog({ onClose }: { onClose: () => void }) {
  const { profile, updateDisplayName, changePassword } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function handleSaveName() {
    setNameError(null);
    setNameSaved(false);
    if (!displayName.trim()) {
      setNameError("Enter a display name.");
      return;
    }
    setIsSavingName(true);
    try {
      await updateDisplayName(displayName);
      setNameSaved(true);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleSavePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.trim().length < 6) {
      setPasswordError("Use at least 6 characters for the new password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setIsSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <Modal title="Profile Settings" onClose={onClose} width={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid var(--card-border)" }}>
        <h3 style={{ margin: 0 }}>Display name</h3>
        <div className="field" style={{ marginBottom: 0 }}>
          <input
            id="profileDisplayName"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameSaved(false);
            }}
          />
        </div>
        {nameError && <p className="error-text" style={{ margin: 0 }}>{nameError}</p>}
        {nameSaved && (
          <p className="chip chip-success" style={{ display: "inline-flex", margin: 0 }}>
            Saved
          </p>
        )}
        <button
          className="btn btn-tonal btn-sm"
          disabled={isSavingName || displayName.trim() === profile?.displayName}
          onClick={handleSaveName}
          style={{ alignSelf: "flex-start" }}
        >
          {isSavingName ? "Saving..." : "Save name"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Change password</h3>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="confirmNewPassword">Confirm new password</label>
          <input
            id="confirmNewPassword"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {passwordError && <p className="error-text" style={{ margin: 0 }}>{passwordError}</p>}
        {passwordSaved && (
          <p className="chip chip-success" style={{ display: "inline-flex", margin: 0 }}>
            Password updated
          </p>
        )}
        <button className="btn btn-tonal btn-sm" disabled={isSavingPassword} onClick={handleSavePassword} style={{ alignSelf: "flex-start" }}>
          {isSavingPassword ? "Saving..." : "Update password"}
        </button>
      </div>

      <div className="modal-actions">
        <button className="btn btn-filled" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
