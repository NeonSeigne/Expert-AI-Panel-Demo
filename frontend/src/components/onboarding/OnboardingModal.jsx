import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParticipants } from '../../context/ParticipantsContext';
import OnboardingStepWelcome from './OnboardingStepWelcome';
import OnboardingStepIntro from './OnboardingStepIntro';
import OnboardingStepParticipants from './OnboardingStepParticipants';
import OnboardingStepHuman from './OnboardingStepHuman';
import OnboardingStepPreferences from './OnboardingStepPreferences';
import MdDialog from '../md/MdDialog';
import '../../neon/neon-material.register.js';

const STEP_COUNT = 5;

/**
 * Multi-step onboarding wizard for the welcome screen.
 * Auto-opens once (localStorage); reopen via header Tutorial.
 */
export default function OnboardingModal({ isOpen, onDismiss }) {
  const {
    selectedIds,
    humanParticipant,
    participantDirectoryOpen,
    handleConfirmParticipantSelection,
    handleSaveHuman,
    handleRemoveHuman,
  } = useParticipants();

  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState('forward');
  const [stagedIds, setStagedIds] = useState([]);
  const [includeSelf, setIncludeSelf] = useState(null);
  const [humanName, setHumanName] = useState('Pat');
  const [humanProfile, setHumanProfile] = useState('');
  const wasOpenRef = useRef(false);
  const directoryWasOpenRef = useRef(false);

  // Initialize draft state only on the closed -> open transition. Reading
  // selectedIds / humanParticipant inside here (rather than as effect deps)
  // means confirming the roster mid-wizard won't reset the step index.
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      directoryWasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setStep(0);
    setSlideDir('forward');
    setStagedIds([...selectedIds]);
    if (humanParticipant) {
      setIncludeSelf(true);
      setHumanName(humanParticipant.name || 'Pat');
      setHumanProfile(humanParticipant.profile_text || '');
    } else {
      setIncludeSelf(false);
      setHumanName('Pat');
      setHumanProfile('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init only on open transition
  }, [isOpen]);

  // After contacts modal closes on the participants step, pull confirmed
  // selection back into onboarding draft state.
  useEffect(() => {
    if (!isOpen || step !== 2) {
      directoryWasOpenRef.current = participantDirectoryOpen;
      return;
    }
    const wasOpen = directoryWasOpenRef.current;
    directoryWasOpenRef.current = participantDirectoryOpen;
    if (wasOpen && !participantDirectoryOpen) {
      setStagedIds([...selectedIds]);
    }
  }, [isOpen, step, participantDirectoryOpen, selectedIds]);

  const canGoNext = useMemo(() => {
    if (step === 2) return stagedIds.length >= 2;
    if (step === 3) {
      if (includeSelf === null) return false;
      if (includeSelf === true) {
        return Boolean(humanName.trim() && humanProfile.trim());
      }
      return true;
    }
    return true;
  }, [step, stagedIds, includeSelf, humanName, humanProfile]);

  const commitAndDismiss = useCallback(() => {
    handleConfirmParticipantSelection(stagedIds);
    if (includeSelf === true) {
      const pid = humanParticipant?.participant_id || `human_${Date.now()}`;
      handleSaveHuman({
        participant_id: pid,
        name: humanName.trim(),
        profile_text: humanProfile.trim(),
      });
    } else if (includeSelf === false && humanParticipant) {
      handleRemoveHuman();
    }
    onDismiss?.();
  }, [
    stagedIds,
    includeSelf,
    humanName,
    humanProfile,
    humanParticipant,
    handleConfirmParticipantSelection,
    handleSaveHuman,
    handleRemoveHuman,
    onDismiss,
  ]);

  const goToStep = useCallback((nextStep) => {
    setSlideDir(nextStep > step ? 'forward' : 'back');
    setStep(nextStep);
  }, [step]);

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    if (step === 2) {
      handleConfirmParticipantSelection(stagedIds);
    }
    if (step === 3) {
      if (includeSelf === true) {
        const pid = humanParticipant?.participant_id || `human_${Date.now()}`;
        handleSaveHuman({
          participant_id: pid,
          name: humanName.trim(),
          profile_text: humanProfile.trim(),
        });
      } else if (includeSelf === false && humanParticipant) {
        handleRemoveHuman();
      }
    }
    if (step >= STEP_COUNT - 1) {
      commitAndDismiss();
      return;
    }
    setSlideDir('forward');
    setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
  }, [
    canGoNext,
    step,
    stagedIds,
    includeSelf,
    humanName,
    humanProfile,
    humanParticipant,
    handleConfirmParticipantSelection,
    handleSaveHuman,
    handleRemoveHuman,
    commitAndDismiss,
  ]);

  const goPrev = useCallback(() => {
    if (step <= 0) return;
    setSlideDir('back');
    setStep((s) => Math.max(0, s - 1));
  }, [step]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, goNext, goPrev]);

  const isLast = step === STEP_COUNT - 1;
  const isFirst = step === 0;
  // Participants (2) and preferences (4) need more vertical room for grids/forms.
  const isTallStep = step === 2 || step === 4;

  let stepContent = null;
  if (step === 0) stepContent = <OnboardingStepWelcome />;
  else if (step === 1) stepContent = <OnboardingStepIntro />;
  else if (step === 2) {
    stepContent = (
      <OnboardingStepParticipants
        stagedIds={stagedIds}
        onStagedIdsChange={setStagedIds}
      />
    );
  } else if (step === 3) {
    stepContent = (
      <OnboardingStepHuman
        includeSelf={includeSelf}
        onIncludeSelfChange={setIncludeSelf}
        name={humanName}
        onNameChange={setHumanName}
        profileText={humanProfile}
        onProfileTextChange={setHumanProfile}
      />
    );
  } else if (step === 4) {
    stepContent = <OnboardingStepPreferences />;
  }

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onDismiss}
      size="fullscreen-compact"
      className={
        'onboarding-md-dialog'
        + (isTallStep ? ' onboarding-md-dialog--tall' : '')
      }
      actions={(
        <>
          <md-text-button type="button" onClick={onDismiss}>
            Skip
          </md-text-button>
          <div className="onboarding-dots" role="tablist" aria-label="Onboarding steps">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-label={`Step ${i + 1}`}
                aria-current={i === step ? 'step' : undefined}
                className={
                  'onboarding-dot'
                  + (i === step ? ' onboarding-dot--active' : '')
                  + (i < step ? ' onboarding-dot--done' : '')
                }
                onClick={() => {
                  if (i < step) goToStep(i);
                }}
                disabled={i > step}
              />
            ))}
          </div>
          {!canGoNext && step === 2 && (
            <p className="onboarding-validation-hint">Select at least 2 participants</p>
          )}
          {!canGoNext && step === 3 && includeSelf === true && (
            <p className="onboarding-validation-hint">
              Enter a name and profile to continue
            </p>
          )}
          <span style={{ flex: 1 }} />
          {!isFirst && (
            <md-outlined-button type="button" onClick={goPrev}>
              Back
            </md-outlined-button>
          )}
          <md-filled-button
            type="button"
            onClick={goNext}
            disabled={!canGoNext || undefined}
          >
            {isLast ? 'Finish' : 'Next'}
          </md-filled-button>
        </>
      )}
    >
      <div className="onboarding-card-body">
        <div
          key={step}
          className={
            'onboarding-card-slide'
            + (slideDir === 'back'
              ? ' onboarding-card-slide--back'
              : ' onboarding-card-slide--forward')
          }
        >
          {stepContent}
        </div>
      </div>
    </MdDialog>
  );
}
