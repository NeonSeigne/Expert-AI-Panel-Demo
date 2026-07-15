import React, { useState, useCallback, useEffect } from 'react';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

/**
 * Modal for adding (or editing) the in-the-loop human participant.
 */
export default function HumanParticipantModal({
  isOpen,
  initial,
  onClose,
  onSave,
  onRemove,
}) {
  const [name, setName] = useState('');
  const [profileText, setProfileText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name || 'Pat');
    setProfileText(initial?.profile_text || '');
  }, [isOpen, initial]);

  const handleApprove = useCallback(() => {
    if (!name.trim()) return;
    if (!profileText.trim()) return;
    const pid = initial?.participant_id || `human_${Date.now()}`;
    onSave({
      participant_id: pid,
      name: name.trim(),
      profile_text: profileText.trim(),
    });
  }, [name, profileText, initial, onSave]);

  const canApprove = Boolean(name.trim() && profileText.trim());

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="large"
      headline="Add a Human Participant"
      actions={(
        <>
          {onRemove && initial?.participant_id ? (
            <md-text-button type="button" onClick={onRemove}>
              Remove human
            </md-text-button>
          ) : null}
          <span style={{ flex: 1 }} />
          <md-text-button type="button" onClick={onClose}>
            Cancel
          </md-text-button>
          <md-filled-button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove || undefined}
          >
            Approve
          </md-filled-button>
        </>
      )}
    >
      <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
        Give yourself (or another human) a seat at the table. The orchestrator
        will pause for your input when it&apos;s your turn.
      </p>
      <div className="ccai-human-modal-body">
        <label className="ccai-human-field">
          <span className="ccai-human-field-label md-typescale-label-large">Name</span>
          <md-outlined-text-field
            label="Name"
            value={name}
            placeholder="e.g. Pat, Dr. Lopez, …"
            style={{ width: '100%' }}
            onInput={(e) => setName(e.target.value || '')}
          />
        </label>

        <label className="ccai-human-field">
          <span className="ccai-human-field-label md-typescale-label-large">
            Experience, personality, …
          </span>
          <md-outlined-text-field
            label="Background"
            type="textarea"
            rows={8}
            value={profileText}
            style={{ width: '100%' }}
            placeholder={
              'Describe your background, how you tend to argue, '
              + 'and anything the group should know about your perspective…'
            }
            onInput={(e) => setProfileText(e.target.value || '')}
          />
          <div className="ccai-human-summary-help md-typescale-body-small">
            The orchestrator will turn this into a credential summary
            for the group — the same way it assesses each LLM
            participant&apos;s persona prompt.
          </div>
        </label>
      </div>
    </MdDialog>
  );
}
