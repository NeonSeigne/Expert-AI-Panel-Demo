import React, { useState } from 'react';
import { Play, Shuffle, Square } from 'lucide-react';

export default function ChatControls({ onStart, onStop, disabled, isRunning }) {
  const [starterText, setStarterText] = useState('');

  const handleStartWithText = () => {
    onStart(starterText.trim() || null);
  };

  const handleAutoStart = () => {
    onStart(null);
  };

  return (
    <div className="chat-controls">
      {isRunning ? (
        <button className="btn-stop" onClick={onStop} title="Stop the conversation">
          <Square size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Stop Chat
        </button>
      ) : (
        <>
          <button
            className="btn-primary"
            onClick={handleAutoStart}
            disabled={disabled}
            title="Let the LLMs start on their own"
          >
            <Shuffle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Let Them Start
          </button>
          <input
            type="text"
            placeholder="Let them start on their own, or enter a conversation starter here"
            value={starterText}
            onChange={e => setStarterText(e.target.value)}
            disabled={disabled}
            onKeyDown={e => {
              if (e.key === 'Enter' && !disabled) handleStartWithText();
            }}
          />
          <button
            className="btn-primary"
            onClick={handleStartWithText}
            disabled={disabled}
            title="Start with your message"
          >
            <Play size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Start Chat With My Prompt
          </button>
        </>
      )}
    </div>
  );
}
