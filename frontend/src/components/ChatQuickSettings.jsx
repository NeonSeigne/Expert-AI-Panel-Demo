import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import MaterialSelectField from './settings/material/MaterialSelectField';

const ROUND_OPTIONS = [1, 2, 3, 4].map((n) => ({
  value: String(n),
  label: String(n),
}));

const DEFAULT_ROUNDS = 2;

/**
 * Compact pre-start controls for empty chat.
 * Team presets own structure/decision; only rounds are exposed here.
 */
export default function ChatQuickSettings() {
  const {
    limitsOverrides,
    handleConversationLimitsChange,
  } = useSettings();
  const { activeTeamId } = useParticipants();

  const effectiveRounds = limitsOverrides?.critique_rounds ?? DEFAULT_ROUNDS;
  const roundsLabel = activeTeamId === 'marketing' ? 'Ideation rounds' : 'Rounds';

  const handleRoundsChange = (raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 4) return;
    handleConversationLimitsChange?.({
      ...(limitsOverrides || {}),
      critique_rounds: n,
    });
  };

  return (
    <div
      className="chat-quick-settings"
      role="group"
      aria-label="Chat settings"
    >
      <MaterialSelectField
        label={roundsLabel}
        value={String(effectiveRounds)}
        options={ROUND_OPTIONS}
        onChange={handleRoundsChange}
      />
    </div>
  );
}
