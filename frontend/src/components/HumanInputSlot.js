import React, { useState, useEffect, useRef } from 'react';
import { Send, SkipForward } from 'lucide-react';

/**
 * Inline input slot rendered in the chat stream when it's the human
 * participant's turn. Replaces what would otherwise be the LLM's
 * message bubble. Visually distinct via a thick green left-edge
 * accent and a pulsing border so it's obvious "we're waiting on you".
 *
 * Props:
 *   awaiting   - the awaiting_human payload from the most recent
 *                human_turn_needed SSE event:
 *                  { speaker_id, speaker_name, phase,
 *                    addressed_to?, asker_name?, prompt_context? }
 *   onSubmit   - async (text) => void
 *   onSkip     - async ()      => void   (only when allowSkip)
 *   allowSkip  - bool, defaults true
 *   sending    - bool: disable the buttons while a submit is in flight
 */
export default function HumanInputSlot({
  awaiting,
  onSubmit,
  onSkip,
  allowSkip = true,
  sending = false,
}) {
  const [text, setText] = useState('');
  const taRef = useRef(null);

  // Auto-focus when the slot first appears, so the user can start
  // typing immediately without hunting for the textarea.
  useEffect(() => {
    if (awaiting && taRef.current) {
      taRef.current.focus();
    }
    // We intentionally narrow the dep list to the identity of the
    // pending turn (speaker + phase). Re-focusing on every awaiting
    // mutation would steal focus from the user mid-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting?.speaker_id, awaiting?.phase]);

  if (!awaiting) return null;

  const name = awaiting.speaker_name || 'you';
  const askerLine = awaiting.asker_name
    ? `${awaiting.asker_name} asked: ${awaiting.prompt_context || '…'}`
    : awaiting.prompt_context || '';

  const handleSubmit = async () => {
    const value = text.trim();
    if (!value) return;
    await onSubmit?.(value);
    setText('');
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd+Enter submits; plain Enter inserts a newline (textarea default).
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="ccai-human-slot" data-speaker-id={awaiting.speaker_id || ''}>
      <div className="ccai-human-slot-accent" />
      <div className="ccai-human-slot-body">
        <div className="ccai-human-slot-header">
          <span className="ccai-human-slot-name">{name}</span>
          <span className="ccai-human-slot-pulse" aria-hidden="true" />
          <span className="ccai-human-slot-prompt">
            {name}, please type your response here.
          </span>
        </div>
        {askerLine && (
          <div className="ccai-human-slot-context">{askerLine}</div>
        )}
        <textarea
          ref={taRef}
          className="ccai-human-slot-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder={`${name} please type your response here`}
          disabled={sending}
        />
        <div className="ccai-human-slot-actions">
          <span className="ccai-human-slot-hint">
            Ctrl+Enter to submit
          </span>
          <div className="ccai-human-slot-actions-right">
            {allowSkip && (
              <button
                type="button"
                className="btn-sm btn-outline ccai-human-slot-skip"
                onClick={() => onSkip?.()}
                disabled={sending}
                title="Skip my turn this round"
              >
                <SkipForward size={14} style={{ marginRight: 4 }} />
                Skip my turn
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm ccai-human-slot-submit"
              onClick={handleSubmit}
              disabled={sending || !text.trim()}
            >
              <Send size={14} style={{ marginRight: 4 }} />
              {sending ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
