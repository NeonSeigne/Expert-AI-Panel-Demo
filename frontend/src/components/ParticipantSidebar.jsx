import React, { useState } from 'react';
import { ChevronDown, ChevronRight, User, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';

export default function ParticipantSidebar() {
  const { maxParticipants, neonPromptByModelId } = useSettings();
  const {
    selectedParticipants: participants,
    enabledMap,
    modelAssignments,
    autoSelectMode,
    handleSidebarToggleEnabled,
    handleSidebarRemove,
  } = useParticipants();

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
            neonPromptByModelId={neonPromptByModelId}
            onToggleEnabled={() => handleSidebarToggleEnabled(p.participant_id, !enabled)}
            onRemove={() => handleSidebarRemove(p.participant_id)}
          />
        );
      })}
    </aside>
  );
}

function ParticipantCard({ participant, enabled, modelOverride, neonPromptByModelId, onToggleEnabled, onRemove }) {
  const [open, setOpen] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const isHuman = participant.kind === 'human';

  const effectiveModelId = modelOverride
    || participant.default_model_id
    || (participant.kind === 'neon' ? participant.participant_id : '');
  const personaPrompt = (effectiveModelId.startsWith('neon:')
    && neonPromptByModelId[effectiveModelId])
    || participant.role_prompt
    || '';

  const PROMPT_PREVIEW_CHARS = 280;
  const promptIsLong = personaPrompt.length > PROMPT_PREVIEW_CHARS;

  const handleToggleOpen = () => {
    setOpen((wasOpen) => {
      if (wasOpen) setPromptExpanded(false);
      return !wasOpen;
    });
  };

  return (
    <div
      className={
        'ccai-participant-card'
        + (enabled ? '' : ' ccai-participant-card-off')
        + (isHuman ? ' ccai-participant-card-human' : '')
      }
    >
      <div
        className={
          'ccai-participant-row'
          + (open ? ' ccai-participant-row--expanded' : '')
        }
      >
        <button
          className="ccai-accordion-chevron"
          onClick={handleToggleOpen}
          aria-label="Toggle participant details"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div
          className={
            'ccai-participant-name'
            + (open ? ' ccai-participant-name--expanded' : '')
          }
          title={!open ? participant.name : undefined}
        >
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
              <input type="checkbox" checked={true} onChange={onToggleEnabled} />
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
          <button className="btn-sm btn-outline ccai-reenable-btn" onClick={onToggleEnabled}>
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
                <pre
                  className={
                    'ccai-participant-prompt'
                    + (promptIsLong && !promptExpanded ? ' ccai-participant-prompt--preview' : '')
                  }
                >
                  {personaPrompt || '(no prompt set)'}
                </pre>
                {promptIsLong && (
                  <button
                    type="button"
                    className="ccai-participant-prompt-toggle"
                    onClick={() => setPromptExpanded(v => !v)}
                  >
                    {promptExpanded ? 'Show less' : 'Show full prompt'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
