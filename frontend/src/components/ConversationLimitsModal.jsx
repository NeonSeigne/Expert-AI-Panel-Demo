import React from 'react';
import ConversationLimitsForm from './ConversationLimitsForm';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

/**
 * Settings modal for the user-tunable repetition / failsafe limits.
 */
export default function ConversationLimitsModal({
  isOpen,
  schema,
  overrides,
  onClose,
  onChange,
  onResetAll,
}) {
  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="large"
      headline="Conversation limits"
      actions={(
        <>
          <md-text-button type="button" onClick={onResetAll}>
            Reset all
          </md-text-button>
          <md-filled-button type="button" onClick={onClose}>
            Done
          </md-filled-button>
        </>
      )}
    >
      <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
        These knobs control how long each phase of the discussion runs and when
        the conversation pauses for a Continue confirmation. Changes apply to
        the next chat you start.
      </p>
      {!schema ? (
        <div className="ccai-credentials-empty">Loading limits...</div>
      ) : (
        <ConversationLimitsForm
          schema={schema}
          overrides={overrides}
          onChange={onChange}
          onResetAll={onResetAll}
          showResetAll={false}
        />
      )}
    </MdDialog>
  );
}
