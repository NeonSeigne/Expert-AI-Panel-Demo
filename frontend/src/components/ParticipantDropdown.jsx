import React, { useState, useRef, useEffect } from 'react';
import { Users, Plus, ChevronDown, Wand2, Check } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';

export default function ParticipantDropdown() {
  const { maxParticipants } = useSettings();
  const {
    catalog,
    expertPersonas,
    selectedIds,
    autoSelectMode,
    handleToggleParticipant,
    handleOpenExpertModal,
    handleToggleAutoSelectMode,
  } = useParticipants();
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
  // When auto-select is on, checkboxes are deferred entirely - the
  // orchestrator picks at start time, so user picks are ignored.
  const checkboxDisabledForAuto = !!autoSelectMode;

  const openCreateExpertModal = () => {
    setOpen(false);
    handleOpenExpertModal(null);
  };

  return (
    <div className="ccai-dropdown-wrap" ref={ref}>
      <button
        className="btn-sm btn-outline ccai-dropdown-trigger"
        onClick={() => setOpen(o => !o)}
        title={
          autoSelectMode
            ? 'Auto-select mode: participants picked at chat start by the orchestrator'
            : 'Add or remove participants'
        }
      >
        <Users size={14} />
        <span>
          {autoSelectMode
            ? 'Participants Auto Selected'
            : `Participants (${selectedIds.length}/${maxParticipants})`}
        </span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="ccai-dropdown-backdrop"
            aria-label="Close participants menu"
            onClick={() => setOpen(false)}
          />
          <div className="ccai-dropdown-panel">
          <div className="ccai-dropdown-section">
            <button
              type="button"
              className={
                'ccai-dropdown-autoselect' +
                (autoSelectMode ? ' ccai-dropdown-autoselect-on' : '')
              }
              onClick={() => handleToggleAutoSelectMode?.(!autoSelectMode)}
              title={
                autoSelectMode
                  ? 'Turn off auto-select and resume manual picking'
                  : 'Defer participant selection until chat start; the orchestrator will pick the most relevant.'
              }
            >
              {autoSelectMode ? <Check size={14} /> : <Wand2 size={14} />}
              <span>Select {maxParticipants} Automatically</span>
            </button>
            <div className="ccai-dropdown-autoselect-help">
              {autoSelectMode
                ? 'The orchestrator will pick the most relevant participants for your question when you start the chat.'
                : 'Create or pick manually from the lists below.'}
            </div>
            <CreateExpertPersonaButton onClick={openCreateExpertModal} />
          </div>
          <div className="ccai-dropdown-divider" />
          <div
            className={
              'ccai-dropdown-section' +
              (checkboxDisabledForAuto ? ' ccai-dropdown-section-muted' : '')
            }
          >
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
                disabledForAdd={
                  checkboxDisabledForAuto
                  || (atCap && !isSelected(p.participant_id))
                }
                autoSelectActive={checkboxDisabledForAuto}
                onToggle={() => handleToggleParticipant(p)}
              />
            ))}
          </div>
          <div className="ccai-dropdown-divider" />
          <div
            className={
              'ccai-dropdown-section' +
              (checkboxDisabledForAuto ? ' ccai-dropdown-section-muted' : '')
            }
          >
            <div className="ccai-dropdown-section-title">Extra Personas</div>
            {(catalog?.extra || []).map((p) => (
              <DropdownItem
                key={p.participant_id}
                participant={p}
                checked={isSelected(p.participant_id)}
                disabledForAdd={
                  checkboxDisabledForAuto
                  || (atCap && !isSelected(p.participant_id))
                }
                autoSelectActive={checkboxDisabledForAuto}
                onToggle={() => handleToggleParticipant(p)}
              />
            ))}
          </div>
          <div className="ccai-dropdown-divider" />
          <div
            className={
              'ccai-dropdown-section' +
              (checkboxDisabledForAuto ? ' ccai-dropdown-section-muted' : '')
            }
          >
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
                disabledForAdd={
                  checkboxDisabledForAuto
                  || (atCap && !isSelected(p.participant_id))
                }
                autoSelectActive={checkboxDisabledForAuto}
                onToggle={() => handleToggleParticipant(p)}
              />
            ))}
            <CreateExpertPersonaButton onClick={openCreateExpertModal} />
          </div>
          </div>
        </>
      )}
    </div>
  );
}

function CreateExpertPersonaButton({ onClick, className }) {
  return (
    <button
      type="button"
      className={
        'ccai-dropdown-create-btn'
        + (className ? ` ${className}` : '')
      }
      onClick={onClick}
    >
      <Plus size={12} />
      Create Expert Persona...
    </button>
  );
}

function DropdownItem({ participant, checked, disabledForAdd, autoSelectActive, onToggle }) {
  return (
    <label
      className={
        'ccai-dropdown-item' +
        (checked ? ' ccai-dropdown-item-checked' : '') +
        (disabledForAdd ? ' ccai-dropdown-item-disabled' : '')
      }
      title={
        autoSelectActive
          ? 'Disabled while auto-select is on'
          : (disabledForAdd ? 'Participant cap reached' : '')
      }
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
