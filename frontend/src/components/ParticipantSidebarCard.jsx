import React from 'react';
import '../neon/neon-material.register.js';
import NeonAvatar from '../neon/NeonAvatar';
import { avatarColorForParticipant } from '../utils/participantAvatar';

export default function ParticipantSidebarCard({
  participant,
  colorIndex = 0,
  enabled,
  modelOverride,
  collapsed = false,
  onToggleEnabled,
  onRemove,
  onOpenProfile,
}) {
  const isHuman = participant.kind === 'human';
  const modelLabel = modelOverride
    || participant.default_model_id
    || participant.model_display
    || '';
  const avatarColor = avatarColorForParticipant(participant, colorIndex);
  const initial = (participant.name || '?').charAt(0).toUpperCase();

  const handleSwitchInput = (e) => {
    e.stopPropagation();
    onToggleEnabled();
  };

  const handleProfileClick = () => {
    onOpenProfile(participant);
  };

  const handleRemoveClick = (e) => {
    e.stopPropagation();
    onRemove();
  };

  const rowClass = [
    'neon-participant-row',
    enabled ? '' : ' neon-participant-row--off',
    isHuman ? ' neon-participant-row--human' : '',
    collapsed ? ' neon-participant-row--rail' : '',
  ].join('');

  if (collapsed) {
    return (
      <div role="listitem" className={rowClass}>
        <button
          type="button"
          className="neon-participant-row__rail-btn"
          onClick={handleProfileClick}
          title={participant.name}
          aria-label={`${participant.name}${enabled ? '' : ' (disabled)'}`}
        >
          {isHuman ? (
            <NeonAvatar kind="user" size="sm" />
          ) : (
            <NeonAvatar
              kind="initial"
              size="sm"
              label={initial}
              backgroundColor={avatarColor}
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div role="listitem" className={rowClass}>
      <div className="neon-participant-row__main">
        <button
          type="button"
          className="neon-participant-row__profile"
          onClick={handleProfileClick}
          title={`View ${participant.name} in directory`}
        >
          {isHuman ? (
            <NeonAvatar kind="user" size="sm" />
          ) : (
            <NeonAvatar
              kind="initial"
              size="sm"
              label={initial}
              backgroundColor={avatarColor}
            />
          )}
          <span className="neon-participant-row__meta">
            <span className="neon-participant-row__name">{participant.name}</span>
            {isHuman ? (
              <span className="neon-participant-row__human-chip">Human</span>
            ) : (
              modelLabel && (
                <span className="neon-participant-row__subtitle">{modelLabel}</span>
              )
            )}
          </span>
        </button>
        <div className="neon-participant-row__actions">
          <md-switch
            selected={enabled}
            aria-label={`Enable ${participant.name}`}
            onClick={(e) => e.stopPropagation()}
            onInput={handleSwitchInput}
          />
        </div>
      </div>
      {!enabled && (
        <div className="neon-participant-row__footer">
          <button
            type="button"
            className="neon-participant-row__remove-btn"
            onClick={handleRemoveClick}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
