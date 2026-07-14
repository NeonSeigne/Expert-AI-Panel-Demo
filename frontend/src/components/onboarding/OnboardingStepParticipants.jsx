import React, { useCallback, useMemo } from 'react';
import { LayoutGrid, UserPlus, Wand2 } from 'lucide-react';
import OnboardingChatGraphic from './OnboardingChatGraphic';
import OnboardingStepHeading from './OnboardingStepHeading';
import ParticipantDirectoryCard from '../ParticipantDirectoryCard';
import {
  AUTO_PICK_COUNT,
  pickRandomParticipantIds,
} from '../ParticipantDirectory';
import { useParticipants } from '../../context/ParticipantsContext';
import { useSettings } from '../../context/SettingsContext';
import { PARTICIPANT_PALETTE } from '../../constants/brandColors';

const PARTICIPANT_MESSAGES = [
  {
    side: 'Agent',
    content: 'Pick at least two personas for the panel.',
    bubbleColor: PARTICIPANT_PALETTE[0].bg,
    avatarKind: 'initial',
    avatarLabel: 'P',
    avatarColor: PARTICIPANT_PALETTE[0].color,
  },
  {
    side: 'Agent',
    content: 'You can refine the roster anytime from the sidebar.',
    bubbleColor: PARTICIPANT_PALETTE[1].bg,
    avatarKind: 'initial',
    avatarLabel: 'A',
    avatarColor: PARTICIPANT_PALETTE[1].color,
  },
];

const SUGGESTION_COUNT = 5;

function buildSuggestions(catalog, expertPersonas) {
  const neon = catalog?.neon || [];
  const extra = catalog?.extra || [];
  const expert = expertPersonas || [];
  const pool = [...neon, ...extra, ...expert];
  return pool.slice(0, SUGGESTION_COUNT);
}

export default function OnboardingStepParticipants({
  stagedIds,
  onStagedIdsChange,
}) {
  const { maxParticipants } = useSettings();
  const {
    catalog,
    expertPersonas,
    humanParticipant,
    handleConfirmParticipantSelection,
    openParticipantDirectory,
  } = useParticipants();

  const humanReserved = humanParticipant ? 1 : 0;
  const selectionCap = Math.max(0, maxParticipants - humanReserved);

  const suggestions = useMemo(
    () => buildSuggestions(catalog, expertPersonas),
    [catalog, expertPersonas],
  );

  const allCatalog = useMemo(() => {
    const neon = catalog?.neon || [];
    const extra = catalog?.extra || [];
    const expert = expertPersonas || [];
    return [...neon, ...extra, ...expert];
  }, [catalog, expertPersonas]);

  const stagedSet = useMemo(() => new Set(stagedIds), [stagedIds]);
  const atCap = stagedIds.length >= selectionCap;

  const handleToggleSelect = useCallback((participant) => {
    const id = participant.participant_id;
    const next = stagedIds.includes(id)
      ? stagedIds.filter((x) => x !== id)
      : (stagedIds.length >= selectionCap ? stagedIds : [...stagedIds, id]);
    onStagedIdsChange(next);
  }, [stagedIds, selectionCap, onStagedIdsChange]);

  const handleSeeAll = useCallback(() => {
    handleConfirmParticipantSelection(stagedIds);
    openParticipantDirectory();
  }, [stagedIds, handleConfirmParticipantSelection, openParticipantDirectory]);

  const handleChooseRandom = useCallback(() => {
    const pickCount = Math.min(AUTO_PICK_COUNT, selectionCap, allCatalog.length);
    if (pickCount === 0) return;
    onStagedIdsChange(pickRandomParticipantIds(allCatalog, pickCount));
  }, [allCatalog, selectionCap, onStagedIdsChange]);

  const canAutoSelect = allCatalog.length > 0 && selectionCap > 0;

  return (
    <div className="onboarding-step onboarding-step--participants">
      <OnboardingStepHeading icon={<UserPlus size={36} strokeWidth={1.75} />}>
        Choose Participants
      </OnboardingStepHeading>
      <OnboardingChatGraphic
        className="onboarding-chat-graphic--compact"
        messages={PARTICIPANT_MESSAGES}
      />

      <div className="onboarding-suggestions-grid" role="list">
        {suggestions.map((participant, index) => {
          const selected = stagedSet.has(participant.participant_id);
          return (
            <div key={participant.participant_id} role="listitem">
              <ParticipantDirectoryCard
                participant={participant}
                colorIndex={index}
                selected={selected}
                disabled={atCap && !selected}
                onFocus={() => handleToggleSelect(participant)}
                onToggleSelect={handleToggleSelect}
              />
            </div>
          );
        })}
        <button
          type="button"
          className="participant-directory-card onboarding-see-all-card"
          onClick={handleSeeAll}
          aria-label="See all participants"
        >
          <div className="onboarding-see-all-card-icon" aria-hidden>
            <LayoutGrid size={22} strokeWidth={1.75} />
          </div>
          <div className="participant-directory-card-name">See All</div>
          <div className="participant-directory-card-model">
            Browse the full directory
          </div>
        </button>
      </div>

      <div className="onboarding-suggestions-footer">
        <span className="onboarding-suggestions-count">
          {stagedIds.length} of {selectionCap} selected
          {stagedIds.length < 2 ? ' — select at least 2' : ''}
        </span>
        <button
          type="button"
          className="onboarding-random-pick-btn"
          onClick={handleChooseRandom}
          disabled={!canAutoSelect}
          title="Randomly pick up to 5 participants from the catalog"
        >
          <Wand2 size={16} strokeWidth={2} aria-hidden />
          Choose 5 randomly
        </button>
      </div>
    </div>
  );
}
