import React, { useState, useEffect, useRef } from 'react';
import { SkipForward } from 'lucide-react';
import NeonDesignRoot from './NeonDesignRoot';
import NeonComposer from '../neon/NeonComposer';
import '../neon/neon-material.register.js';

/**
 * Inline input slot rendered in the chat stream when it's the human
 * participant's turn. Replaces what would otherwise be the LLM's
 * message bubble. Visually distinct via a thick green left-edge
 * accent and a pulsing border so it's obvious "we're waiting on you".
 */
export default function HumanInputSlot({
  awaiting,
  onSubmit,
  onSkip,
  allowSkip = true,
  sending = false,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (awaiting && inputRef.current) {
      inputRef.current.focus();
    }
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
        <NeonDesignRoot>
          <NeonComposer
            inputRef={inputRef}
            value={text}
            onChange={setText}
            onSend={handleSubmit}
            onKeyDown={handleKeyDown}
            placeholder={`${name}, please type your response here`}
            disabled={sending}
            sendDisabled={sending || !text.trim()}
            showMic={false}
            showAttach={false}
            toolbar={
              <div className="ccai-human-slot-toolbar">
                <span className="ccai-human-slot-hint">Ctrl+Enter to submit</span>
                {allowSkip && (
                  <md-outlined-button
                    type="button"
                    className="ccai-human-slot-skip"
                    onClick={() => onSkip?.()}
                    disabled={sending || undefined}
                    title="Skip my turn this round"
                  >
                    <SkipForward size={14} slot="icon" aria-hidden />
                    Skip my turn
                  </md-outlined-button>
                )}
              </div>
            }
          />
        </NeonDesignRoot>
      </div>
    </div>
  );
}
