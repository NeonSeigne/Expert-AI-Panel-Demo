import React, { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

/**
 * Replaces LLMChats3's LLMSelector. Lists the user's currently selected
 * participants with:
 *   - Toggle slider (on/off, doesn't deselect)
 *   - Accordion showing the LLM and the persona prompt
 *   - "Remove" button when the participant is off (does deselect)
 */
export default function ParticipantSidebar({
  participants,
  enabledMap,
  modelAssignments,
  onToggleEnabled,
  onRemove,
}) {
  return (
    <aside className="sidebar ccai-sidebar">
      <div className="ccai-sidebar-header">
        <h2 className="sidebar-title">Participants</h2>
        <div className="ccai-sidebar-help">
          {participants.length === 0 ? (
            <em>Use the Participants dropdown in the header to add some.</em>
          ) : (
            <em>Drag to reorder is not supported yet — order is by selection.</em>
          )}
        </div>
      </div>
      {participants.map((p) => {
        const enabled = enabledMap[p.participant_id] !== false;
        const modelOverride = modelAssignments[p.participant_id];
        return (
          <ParticipantCard
            key={p.participant_id}
            participant={p}
            enabled={enabled}
            modelOverride={modelOverride}
            onToggleEnabled={() => onToggleEnabled(p.participant_id, !enabled)}
            onRemove={() => onRemove(p.participant_id)}
          />
        );
      })}
    </aside>
  );
}

function ParticipantCard({ participant, enabled, modelOverride, onToggleEnabled, onRemove }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={
        'ccai-participant-card' + (enabled ? '' : ' ccai-participant-card-off')
      }
    >
      <div className="ccai-participant-row">
        <button
          className="ccai-accordion-chevron"
          onClick={() => setOpen(o => !o)}
          aria-label="Toggle participant details"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="ccai-participant-name">{participant.name}</div>
        <div className="ccai-participant-controls">
          {enabled ? (
            <label className="ccai-toggle" title="Toggle participation">
              <input
                type="checkbox"
                checked={true}
                onChange={onToggleEnabled}
              />
              <span className="ccai-toggle-slider"></span>
            </label>
          ) : (
            <button
              className="btn-sm ccai-remove-btn"
              onClick={onRemove}
              title="Remove from this conversation"
            >
              <X size={12} /> Remove
            </button>
          )}
        </div>
      </div>
      {!enabled && (
        <div className="ccai-participant-row ccai-participant-row-secondary">
          <button
            className="btn-sm btn-outline ccai-reenable-btn"
            onClick={onToggleEnabled}
          >
            Re-enable
          </button>
        </div>
      )}
      {open && (
        <div className="ccai-participant-body">
          <div className="ccai-participant-field">
            <div className="ccai-participant-field-label">LLM</div>
            <div className="ccai-participant-field-value">
              {modelOverride || participant.default_model_id || participant.model_display || ''}
            </div>
          </div>
          <div className="ccai-participant-field">
            <div className="ccai-participant-field-label">Persona prompt</div>
            <pre className="ccai-participant-prompt">
              {participant.role_prompt || '(no prompt set)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
