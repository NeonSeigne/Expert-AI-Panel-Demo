import React from 'react';
import { RotateCcw } from 'lucide-react';
import ConversationLimitsForm from './ConversationLimitsForm';

/**
 * Settings modal for the user-tunable repetition / failsafe limits.
 * Body is shared with Preferences Advanced via ConversationLimitsForm.
 */
export default function ConversationLimitsModal({
  isOpen,
  schema,
  overrides,
  onClose,
  onChange,
  onResetAll,
}) {
  if (!isOpen) return null;

  if (!schema) {
    return (
      <div className="ccai-credentials-overlay">
        <div className="ccai-credentials-card">
          <div className="ccai-credentials-header">
            <div>
              <h2>Conversation limits</h2>
            </div>
            <div className="ccai-tab-spacer" />
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="ccai-credentials-body">
            <div className="ccai-credentials-empty">Loading limits...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Conversation limits</h2>
            <div className="ccai-credentials-subtitle">
              These knobs control how long each phase of the discussion
              runs and when the conversation pauses for a Continue
              confirmation. Changes apply to the next chat you start.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          <button
            type="button"
            className="btn-sm btn-outline"
            onClick={onResetAll}
            title="Restore every knob to the server default"
          >
            <RotateCcw size={14} style={{ marginRight: 4 }} />
            Reset all
          </button>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ccai-credentials-body">
          <ConversationLimitsForm
            schema={schema}
            overrides={overrides}
            onChange={onChange}
            onResetAll={onResetAll}
            showResetAll={false}
          />
        </div>
      </div>
    </div>
  );
}
