import React from 'react';
import { Check, Plus } from 'lucide-react';
import { AVATAR_PALETTE } from '../constants/brandColors';

export function avatarColorForIndex(idx) {
  return AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
}

export default function ParticipantDirectoryCard({
  participant,
  colorIndex = 0,
  selected = false,
  focused = false,
  disabled = false,
  onFocus,
  onToggleSelect,
}) {
  const initial = (participant.name || '?').charAt(0).toUpperCase();
  const modelLabel = participant.model_display || participant.default_model_id || '';

  const handleCardClick = () => {
    onFocus?.(participant);
  };

  const handleToggleClick = (e) => {
    e.stopPropagation();
    if (disabled && !selected) return;
    onToggleSelect?.(participant);
  };

  const className = [
    'participant-directory-card',
    selected ? 'participant-directory-card--selected' : '',
    focused ? 'participant-directory-card--focused' : '',
    disabled && !selected ? 'participant-directory-card--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      data-participant-id={participant.participant_id}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <button
        type="button"
        className="participant-directory-card-toggle"
        aria-label={selected ? `Remove ${participant.name}` : `Add ${participant.name}`}
        disabled={disabled && !selected}
        onClick={handleToggleClick}
      >
        {selected ? (
          <Check size={14} strokeWidth={2.5} aria-hidden />
        ) : (
          <Plus size={14} strokeWidth={2.5} aria-hidden />
        )}
      </button>
      <div
        className="participant-directory-card-avatar"
        style={{ background: avatarColorForIndex(colorIndex) }}
        aria-hidden
      >
        {initial}
      </div>
      <div className="participant-directory-card-name">{participant.name}</div>
      <div className="participant-directory-card-model">{modelLabel}</div>
    </div>
  );
}
