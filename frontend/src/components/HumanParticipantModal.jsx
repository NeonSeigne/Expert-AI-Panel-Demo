import React, { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal for adding (or editing) the in-the-loop human participant.
 *
 * The user enters a name and a freeform self-description (experience,
 * personality, etc.). On Approve the parent saves immediately and
 * generates the structured credential summary in the background.
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

  if (!isOpen) return null;

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card ccai-human-modal-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Add a Human Participant</h2>
            <div className="ccai-credentials-subtitle">
              Give yourself (or another human) a seat at the table.
              The orchestrator will pause for your input when it&apos;s
              your turn.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ccai-human-modal-body">
          <label className="ccai-human-field">
            <span className="ccai-human-field-label">Name</span>
            <input
              type="text"
              className="ccai-human-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pat, Dr. Lopez, …"
            />
          </label>

          <label className="ccai-human-field">
            <span className="ccai-human-field-label">
              Experience, personality, …
            </span>
            <textarea
              className="ccai-human-summary"
              value={profileText}
              onChange={e => setProfileText(e.target.value)}
              rows={8}
              spellCheck
              placeholder={
                'Describe your background, how you tend to argue, '
                + 'and anything the group should know about your perspective…'
              }
            />
            <div className="ccai-human-summary-help">
              The orchestrator will turn this into a credential summary
              for the group — the same way it assesses each LLM
              participant&apos;s persona prompt.
            </div>
          </label>
        </div>

        <div className="ccai-human-modal-footer">
          <div>
            {onRemove && initial?.participant_id && (
              <button
                type="button"
                className="btn-sm btn-outline ccai-human-remove"
                onClick={onRemove}
                title="Remove the human participant from this session"
              >
                <X size={14} style={{ marginRight: 4 }} />
                Remove human
              </button>
            )}
          </div>
          <div className="ccai-human-modal-footer-right">
            <button
              type="button"
              className="btn-sm btn-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleApprove}
              disabled={!name.trim() || !profileText.trim()}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
