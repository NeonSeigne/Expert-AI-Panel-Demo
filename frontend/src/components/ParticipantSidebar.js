import React, { useState } from 'react';
import { ChevronDown, ChevronRight, User, X } from 'lucide-react';

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
  autoSelectMode,
  maxParticipants,
}) {
  // In auto-select mode with no chat in progress, the sidebar shows a
  // placeholder explaining the deferred selection. Once the chat
  // starts, App.js populates `participants` with the LLM-chosen set
  // and the regular cards render normally.
  const showAutoPlaceholder = autoSelectMode && participants.length === 0;

  return (
    <aside className="sidebar ccai-sidebar">
      <div className="ccai-sidebar-header">
        <h2 className="sidebar-title">Participants</h2>
        {(showAutoPlaceholder || participants.length === 0) && (
          <div className="ccai-sidebar-help">
            {showAutoPlaceholder ? (
              <em>Auto-select is on.</em>
            ) : (
              <em>Use the Participants dropdown in the header to add some.</em>
            )}
          </div>
        )}
      </div>
      {showAutoPlaceholder && (
        <div className="ccai-sidebar-autoselect-empty">
          <strong>Auto-select: {maxParticipants} participants</strong>
          <div style={{ marginTop: 4 }}>
            When you start the chat, the orchestrator will pick the
            {' '}<strong>{maxParticipants}</strong> participants whose
            expertise best fits your question.
          </div>
        </div>
      )}
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
  const isHuman = participant.kind === 'human';

  return (
    <div
      className={
        'ccai-participant-card'
        + (enabled ? '' : ' ccai-participant-card-off')
        + (isHuman ? ' ccai-participant-card-human' : '')
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
        <div className="ccai-participant-name">
          {isHuman && (
            <User
              size={12}
              strokeWidth={2.5}
              style={{ marginRight: 4, verticalAlign: '-2px' }}
            />
          )}
          {participant.name}
          {isHuman && (
            <span className="ccai-participant-human-tag">Human</span>
          )}
        </div>
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
          {isHuman ? (
            <div className="ccai-participant-field">
              <div className="ccai-participant-field-label">Role</div>
              <div className="ccai-participant-field-value">
                In-the-loop human participant. The orchestrator pauses
                for your input when it's your turn. Edit your name and
                credential summary from the "Human:&nbsp;…" button in
                the header.
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
