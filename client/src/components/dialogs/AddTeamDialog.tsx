import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { teamsApi } from "../../api/teams";
import { usersApi } from "../../api/users";
import { ApiError } from "../../errors";
import { useLeagueData } from "../../state/LeagueDataContext";
import type { EntryType, Profile, Team } from "../../api/types";

interface LocalMember {
  localId: string;
  name: string;
  linkedUserId: string | null;
}

export function AddTeamDialog({ team, onClose, onSaved }: { team?: Team; onClose: () => void; onSaved: () => void }) {
  const { teams } = useLeagueData();
  const isEditing = Boolean(team);

  const [name, setName] = useState(team?.name ?? "");
  const [entryType, setEntryType] = useState<EntryType>(team?.entryType ?? "team");
  const [members, setMembers] = useState<LocalMember[]>(
    (team?.members ?? []).map((m) => ({ localId: m.id, name: m.name, linkedUserId: m.linkedUserId })),
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualName, setManualName] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    usersApi
      .list()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

  const linkedElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const t of teams) {
      if (t.id === team?.id) continue;
      for (const m of t.members) {
        if (m.linkedUserId) set.add(m.linkedUserId);
      }
    }
    return set;
  }, [teams, team?.id]);

  const availableProfiles = profiles.filter(
    (p) =>
      p.role === "competitor" &&
      !linkedElsewhere.has(p.id) &&
      !members.some((m) => m.linkedUserId === p.id),
  );

  function handleEntryTypeChange(next: EntryType) {
    setEntryType(next);
    if (next === "individual" && members.length > 1) {
      setMembers((prev) => prev.slice(0, 1));
    }
  }

  function addLinkedUser() {
    setPlayerError(null);
    if (!selectedUserId) {
      setPlayerError("Choose a user to add.");
      return;
    }
    if (members.some((m) => m.linkedUserId === selectedUserId)) {
      setPlayerError("That user has already been added.");
      return;
    }
    if (entryType === "individual" && members.length >= 1) {
      setPlayerError("An individual entry can only contain one player.");
      return;
    }
    const profile = profiles.find((p) => p.id === selectedUserId);
    if (!profile) return;
    setMembers((prev) => [...prev, { localId: `linked-${profile.id}`, name: profile.displayName, linkedUserId: profile.id }]);
    setSelectedUserId("");
  }

  function addManualPlayer() {
    setPlayerError(null);
    const cleaned = manualName.trim();
    if (!cleaned) {
      setPlayerError("Enter a player name.");
      return;
    }
    if (members.some((m) => !m.linkedUserId && m.name.toLowerCase() === cleaned.toLowerCase())) {
      setPlayerError("That player has already been added.");
      return;
    }
    if (entryType === "individual" && members.length >= 1) {
      setPlayerError("An individual entry can only contain one player.");
      return;
    }
    setMembers((prev) => [...prev, { localId: `manual-${Date.now()}-${Math.random()}`, name: cleaned, linkedUserId: null }]);
    setManualName("");
  }

  function removeMember(localId: string) {
    setMembers((prev) => prev.filter((m) => m.localId !== localId));
  }

  async function handleSubmit() {
    setFormError(null);
    setNameError(null);

    if (!name.trim()) {
      setNameError("Enter a name.");
      return;
    }
    if (members.length === 0) {
      setFormError("Add at least one player.");
      return;
    }
    if (entryType === "individual" && members.length !== 1) {
      setFormError("An individual entry must contain exactly one player.");
      return;
    }

    setIsSaving(true);
    try {
      const input = {
        name,
        entryType,
        members: members.map((m) => ({ name: m.name, linkedUserId: m.linkedUserId })),
      };
      if (isEditing && team) {
        await teamsApi.update(team.id, input);
      } else {
        await teamsApi.create(input);
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={isEditing ? "Edit Entry" : "Add Entry"} onClose={onClose} width={520}>
      <div className="field">
        <label htmlFor="team-name">Entry name</label>
        <input id="team-name" placeholder="Enter a unique entry name" value={name} onChange={(e) => setName(e.target.value)} />
        {nameError && <span className="field-error">{nameError}</span>}
      </div>

      <div className="field">
        <label>Entry Type</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={entryType === "individual" ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
            onClick={() => handleEntryTypeChange("individual")}
          >
            Individual
          </button>
          <button
            type="button"
            className={entryType === "team" ? "btn btn-filled btn-sm" : "btn btn-outlined btn-sm"}
            onClick={() => handleEntryTypeChange("team")}
          >
            Team
          </button>
        </div>
      </div>

      <div className="field">
        <label>Players</label>
        <p style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>
          {entryType === "individual"
            ? "Add exactly one player for this individual entry."
            : "Add one or more players from the system or manually."}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">Existing system user</option>
            {availableProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-tonal btn-sm" onClick={addLinkedUser}>
            Add
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Type a player name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="button" className="btn btn-tonal btn-sm" onClick={addManualPlayer}>
            Add
          </button>
        </div>

        {playerError && <p className="error-text">{playerError}</p>}

        <div style={{ border: "1px solid var(--card-border)", borderRadius: 12, padding: 10, display: "flex", flexWrap: "wrap", gap: 8, minHeight: 42 }}>
          {members.map((m) => (
            <span key={m.localId} className="chip">
              {m.linkedUserId ? `${m.name} (system)` : m.name}
              <button
                type="button"
                onClick={() => removeMember(m.localId)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {formError && <p className="error-text">{formError}</p>}

      <div className="modal-actions">
        <button className="btn btn-text" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-filled" disabled={isSaving} onClick={handleSubmit}>
          {isSaving ? "Saving..." : isEditing ? "Update" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
