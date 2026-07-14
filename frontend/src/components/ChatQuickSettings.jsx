import React, { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import MaterialSelectField from './settings/material/MaterialSelectField';

const ROUND_OPTIONS = [1, 2, 3, 4].map((n) => ({
  value: String(n),
  label: String(n),
}));

const DEFAULT_ROUNDS = 2;

/**
 * Compact pre-start controls for empty chat: structure, decision, rounds.
 * Shares Preferences persistence via useSettings.
 */
export default function ChatQuickSettings() {
  const {
    conversationFormats,
    conversationStructureId,
    handleConversationStructureChange,
    decisionMethodId,
    handleDecisionMethodChange,
    limitsOverrides,
    handleConversationLimitsChange,
  } = useSettings();

  const structures = useMemo(
    () => (Array.isArray(conversationFormats?.structures) ? conversationFormats.structures : []),
    [conversationFormats],
  );
  const decisions = useMemo(
    () => (Array.isArray(conversationFormats?.decisions) ? conversationFormats.decisions : []),
    [conversationFormats],
  );

  const structureOptions = useMemo(
    () => structures.map((s) => ({ value: s.id, label: s.name })),
    [structures],
  );
  const decisionOptions = useMemo(
    () => decisions.map((d) => ({ value: d.id, label: d.name })),
    [decisions],
  );

  const effectiveStruct = conversationStructureId
    || conversationFormats?.default_structure_id
    || null;
  const effectiveDec = decisionMethodId
    || conversationFormats?.default_decision_id
    || null;
  const effectiveRounds = limitsOverrides?.critique_rounds ?? DEFAULT_ROUNDS;

  const catalogReady = structures.length > 0 && decisions.length > 0;

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
        label="Structure"
        value={effectiveStruct}
        options={structureOptions}
        disabled={!catalogReady}
        onChange={(id) => handleConversationStructureChange?.(id)}
      />
      <MaterialSelectField
        label="Decision"
        value={effectiveDec}
        options={decisionOptions}
        disabled={!catalogReady}
        onChange={(id) => handleDecisionMethodChange?.(id)}
      />
      <MaterialSelectField
        label="Rounds"
        value={String(effectiveRounds)}
        options={ROUND_OPTIONS}
        onChange={handleRoundsChange}
      />
    </div>
  );
}
