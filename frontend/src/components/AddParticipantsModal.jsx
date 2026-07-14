import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import ParticipantDirectory, {
  AUTO_PICK_COUNT,
  pickRandomParticipantIds,
} from './ParticipantDirectory';

export default function AddParticipantsModal() {
  const { maxParticipants } = useSettings();
  const {
    catalog,
    expertPersonas,
    selectedIds,
    humanParticipant,
    participantDirectoryOpen,
    directoryFocusParticipantId,
    closeParticipantDirectory,
    handleConfirmParticipantSelection,
    handleOpenExpertModal,
  } = useParticipants();

  const [stagedIds, setStagedIds] = useState([]);
  const [sessionKey, setSessionKey] = useState(0);
  const wasOpenRef = useRef(false);

  const humanReserved = humanParticipant ? 1 : 0;
  const selectionCap = Math.max(0, maxParticipants - humanReserved);

  const allCatalog = useMemo(() => {
    const core = catalog?.neon || [];
    const extra = catalog?.extra || [];
    const expert = expertPersonas || [];
    return [...core, ...extra, ...expert];
  }, [catalog, expertPersonas]);

  useEffect(() => {
    if (!participantDirectoryOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;

    setStagedIds([...selectedIds]);
    setSessionKey((k) => k + 1);
  }, [participantDirectoryOpen, selectedIds]);

  useEffect(() => {
    if (!participantDirectoryOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeParticipantDirectory();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [participantDirectoryOpen, closeParticipantDirectory]);

  const selectionChanged = useMemo(() => {
    if (stagedIds.length !== selectedIds.length) return true;
    const sortedStaged = [...stagedIds].sort();
    const sortedSelected = [...selectedIds].sort();
    return sortedStaged.some((id, i) => id !== sortedSelected[i]);
  }, [stagedIds, selectedIds]);

  const handleCreateExpert = () => {
    closeParticipantDirectory();
    handleOpenExpertModal(null);
  };

  const handleConfirm = () => {
    handleConfirmParticipantSelection(stagedIds);
  };

  const handleAutoSelectFive = useCallback(() => {
    const pickCount = Math.min(AUTO_PICK_COUNT, selectionCap, allCatalog.length);
    if (pickCount === 0) return;
    setStagedIds(pickRandomParticipantIds(allCatalog, pickCount));
  }, [allCatalog, selectionCap]);

  const canAutoSelect = allCatalog.length > 0 && selectionCap > 0;

  if (!participantDirectoryOpen) return null;

  return (
    <div
      className="participant-directory-overlay"
      role="presentation"
      onClick={closeParticipantDirectory}
    >
      <div
        className="participant-directory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-directory-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="participant-directory-header">
          <h2 id="participant-directory-title">Add Participants</h2>
          <div className="ccai-tab-spacer" />
          <button
            type="button"
            className="modal-close participant-directory-close"
            onClick={closeParticipantDirectory}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <ParticipantDirectory
          key={sessionKey}
          stagedIds={stagedIds}
          onStagedIdsChange={setStagedIds}
          focusParticipantId={directoryFocusParticipantId}
          autoFocusSearch={!directoryFocusParticipantId}
          onCreateExpert={handleCreateExpert}
        />

        <footer className="participant-directory-footer">
          <span className="participant-directory-footer-summary">
            {stagedIds.length} of {selectionCap} selected
            {selectionChanged ? '' : ' (unchanged)'}
          </span>
          <div className="participant-directory-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={closeParticipantDirectory}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleAutoSelectFive}
              disabled={!canAutoSelect}
              title="Randomly pick up to 5 participants from the catalog"
            >
              Select 5 automatically
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirm}
            >
              Confirm Selection
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
