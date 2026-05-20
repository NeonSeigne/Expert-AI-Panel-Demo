import React, { useState } from 'react';
import { Play, Shuffle } from 'lucide-react';

/**
 * "Let Them Start" picks a random demo question from the bank.
 * "Start Chat With My Prompt" uses the typed-in question.
 *
 * Both require >=2 enabled participants - that's enforced upstream and
 * mirrored here as a disabled state.
 */
export default function ChatControls({
  onStartRandom,
  onStartTyped,
  onStop,
  disabled,
  isRunning,
  disabledReason,
  activeQuestion,
}) {
  const [text, setText] = useState('');
  const placeholder = disabled
    ? (disabledReason || 'Add participants to start a conversation')
    : 'Or type your own question for the group...';
  return (
    <div className="chat-controls">
      {isRunning ? (
        <>
          <button className="btn-stop" onClick={onStop}>
            Stop Chat
          </button>
          {activeQuestion && (
            <div
              className="ccai-active-question"
              title={activeQuestion}
            >
              <span className="ccai-active-question-label">Question:</span>
              <span className="ccai-active-question-text">{activeQuestion}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            className="btn-primary"
            disabled={disabled}
            onClick={() => onStartRandom()}
            title="Pick a random demo question and start"
          >
            <Shuffle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Let Them Start
          </button>
          <input
            type="text"
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !disabled && text.trim()) {
                onStartTyped(text.trim());
              }
            }}
          />
          <button
            className="btn-primary"
            disabled={disabled || !text.trim()}
            onClick={() => onStartTyped(text.trim())}
          >
            <Play size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Start Chat With My Prompt
          </button>
        </>
      )}
    </div>
  );
}
