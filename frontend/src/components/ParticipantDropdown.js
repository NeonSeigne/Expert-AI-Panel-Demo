import React, { useState, useRef, useEffect } from 'react';
import { Users, Plus, ChevronDown } from 'lucide-react';

/**
 * Header dropdown that lists every available participant the user can
 * pull into the conversation. Three sections:
 *   - Neon (HANA personas, vanilla/RAG already filtered server-side)
 *   - Extra (the four bundled non-Neon-LLM personas)
 *   - Expert (user-created, stored in localStorage)
 *
 * Selecting a participant adds them to the active conversation list. The
 * "Create Expert Persona..." entry opens the modal.
 */
export default function ParticipantDropdown({
  catalog,
  expertPersonas,
  selectedIds,
  maxParticipants,
  onToggleParticipant,
  onOpenExpertModal,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (open && ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const isSelected = (id) => selectedIds.includes(id);
  const atCap = selectedIds.length >= maxParticipants;

  return (
    <div className="ccai-dropdown-wrap" ref={ref}>
      <button
        className="btn-sm btn-outline ccai-dropdown-trigger"
        onClick={() => setOpen(o => !o)}
        title="Add or remove participants"
      >
        <Users size={14} />
        <span>Participants ({selectedIds.length}/{maxParticipants})</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="ccai-dropdown-panel">
          <div className="ccai-dropdown-section">
            <div className="ccai-dropdown-section-title">Neon.ai Personas</div>
            {(catalog?.neon || []).length === 0 && (
              <div className="ccai-dropdown-empty">
                Neon personas unavailable - check HANA auth.
              </div>
            )}
            {(catalog?.neon || []).map((p) => (
              <DropdownItem
                key={p.participant_id}
                participant={p}
                checked={isSelected(p.participant_id)}
                disabledForAdd={atCap && !isSelected(p.participant_id)}
                onToggle={() => onToggleParticipant(p, 'neon')}
              />
            ))}
          </div>
          <div className="ccai-dropdown-divider" />
          <div className="ccai-dropdown-section">
            <div className="ccai-dropdown-section-title">Extra Personas</div>
            {(catalog?.extra || []).map((p) => (
              <DropdownItem
                key={p.participant_id}
                participant={p}
                checked={isSelected(p.participant_id)}
                disabledForAdd={atCap && !isSelected(p.participant_id)}
                onToggle={() => onToggleParticipant(p, 'extra')}
              />
            ))}
          </div>
          <div className="ccai-dropdown-divider" />
          <div className="ccai-dropdown-section">
            <div className="ccai-dropdown-section-title">Expert Personas</div>
            {(expertPersonas || []).length === 0 && (
              <div className="ccai-dropdown-empty">
                You haven't created any expert personas yet.
              </div>
            )}
            {(expertPersonas || []).map((p) => (
              <DropdownItem
                key={p.participant_id}
                participant={p}
                checked={isSelected(p.participant_id)}
                disabledForAdd={atCap && !isSelected(p.participant_id)}
                onToggle={() => onToggleParticipant(p, 'expert')}
              />
            ))}
            <button
              className="ccai-dropdown-create-btn"
              onClick={() => { setOpen(false); onOpenExpertModal(null); }}
            >
              <Plus size={12} />
              Create Expert Persona...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({ participant, checked, disabledForAdd, onToggle }) {
  return (
    <label
      className={
        'ccai-dropdown-item' +
        (checked ? ' ccai-dropdown-item-checked' : '') +
        (disabledForAdd ? ' ccai-dropdown-item-disabled' : '')
      }
      title={disabledForAdd ? 'Participant cap reached' : ''}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabledForAdd}
        onChange={onToggle}
      />
      <div className="ccai-dropdown-item-text">
        <div className="ccai-dropdown-item-name">{participant.name}</div>
        <div className="ccai-dropdown-item-sub">
          {participant.model_display || participant.default_model_id || ''}
        </div>
      </div>
    </label>
  );
}
