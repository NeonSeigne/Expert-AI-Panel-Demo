import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import ParticipantDirectory, {
  AUTO_PICK_COUNT,
  pickRandomParticipantIds,
} from './ParticipantDirectory';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

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

  return (
    <MdDialog
      open={Boolean(participantDirectoryOpen)}
      onClose={closeParticipantDirectory}
      size="fullscreen-compact"
      headline="Add Participants"
      actions={(
        <>
          <span className="participant-directory-footer-summary">
            {stagedIds.length} of {selectionCap} selected
            {selectionChanged ? '' : ' (unchanged)'}
          </span>
          <span style={{ flex: 1 }} />
          <md-text-button type="button" onClick={closeParticipantDirectory}>
            Cancel
          </md-text-button>
          <md-outlined-button
            type="button"
            onClick={handleAutoSelectFive}
            disabled={!canAutoSelect || undefined}
            title="Randomly pick up to 5 participants from the catalog"
          >
            Select 5 automatically
          </md-outlined-button>
          <md-filled-button type="button" onClick={handleConfirm}>
            Confirm Selection
          </md-filled-button>
        </>
      )}
    >
      <ParticipantDirectory
        key={sessionKey}
        stagedIds={stagedIds}
        onStagedIdsChange={setStagedIds}
        focusParticipantId={directoryFocusParticipantId}
        autoFocusSearch={!directoryFocusParticipantId}
        onCreateExpert={handleCreateExpert}
      />
    </MdDialog>
  );
}
