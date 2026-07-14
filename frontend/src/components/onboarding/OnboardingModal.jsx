import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useParticipants } from '../../context/ParticipantsContext';
import OnboardingStepWelcome from './OnboardingStepWelcome';
import OnboardingStepIntro from './OnboardingStepIntro';
import OnboardingStepParticipants from './OnboardingStepParticipants';
import OnboardingStepHuman from './OnboardingStepHuman';
import OnboardingStepPreferences from './OnboardingStepPreferences';

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
      if (e.key === 'Escape') onDismiss?.();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onDismiss, goNext, goPrev]);

  if (!isOpen) return null;

  const isLast = step === STEP_COUNT - 1;
  const isFirst = step === 0;

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
    <div className="ccai-credentials-overlay onboarding-overlay" role="presentation">
      <div className="onboarding-frame">
        {!isFirst && (
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow--prev"
            onClick={goPrev}
            aria-label="Previous step"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
        )}

        <div
          className="ccai-credentials-card onboarding-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <button
            type="button"
            className="onboarding-card-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            <X size={18} aria-hidden />
          </button>

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

          <div className="onboarding-card-footer">
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
          </div>
        </div>

        {!isLast ? (
          <button
            type="button"
            className="onboarding-arrow onboarding-arrow--next"
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next step"
          >
            <ChevronRight size={22} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="onboarding-finish-btn onboarding-finish-btn--arrow"
            onClick={goNext}
            aria-label="Finish and start"
          >
            <Check size={22} strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      <button
        type="button"
        className="onboarding-skip"
        onClick={onDismiss}
      >
        Skip
      </button>
    </div>
  );
}
