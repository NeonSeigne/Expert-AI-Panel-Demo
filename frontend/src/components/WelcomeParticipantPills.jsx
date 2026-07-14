import React from 'react';
import { Plus, User } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import { avatarColorForParticipant } from '../utils/participantAvatar';

export default function WelcomeParticipantPills() {
  const { maxParticipants } = useSettings();
  const {
    selectedParticipants,
    autoSelectMode,
    humanParticipant,
    openParticipantDirectory,
    handleOpenHumanModal,
  } = useParticipants();

  const showAutoHint = autoSelectMode && selectedParticipants.length === 0;

  return (
    <div
      className="welcome-participant-pills"
      role="group"
      aria-label="Chat participants"
    >
      {showAutoHint && (
        <span className="welcome-participant-pill welcome-participant-pill--auto">
          Auto-select · up to {maxParticipants}
        </span>
      )}
      {selectedParticipants.map((p, i) => (
        <button
          key={p.participant_id}
          type="button"
          className="welcome-participant-pill welcome-participant-pill--participant"
          title={`View ${p.name} in directory`}
          onClick={() => openParticipantDirectory(p.participant_id)}
        >
          <span
            className="welcome-participant-pill-avatar"
            style={{ background: avatarColorForParticipant(p, i) }}
            aria-hidden
          >
            {(p.name || '?').charAt(0).toUpperCase()}
          </span>
          {p.name}
        </button>
      ))}
      <button
        type="button"
        className={
          'welcome-participant-pill welcome-participant-pill--add'
          + (humanParticipant ? ' welcome-participant-pill--yourself-active' : '')
        }
        onClick={handleOpenHumanModal}
        title={
          humanParticipant
            ? `Edit ${humanParticipant.name}'s participant profile`
            : 'Add yourself as a human participant'
        }
      >
        <User size={14} strokeWidth={2.5} aria-hidden />
        {humanParticipant ? humanParticipant.name : 'Yourself'}
      </button>
      <button
        type="button"
        className="welcome-participant-pill welcome-participant-pill--add"
        onClick={() => openParticipantDirectory()}
        title="Add or change participants"
      >
        <Plus size={14} strokeWidth={2.5} aria-hidden />
        Add Participant
      </button>
    </div>
  );
}
