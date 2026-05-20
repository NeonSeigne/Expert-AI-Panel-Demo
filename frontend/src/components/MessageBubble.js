import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MessageBubble({ message, showResponseTime }) {
  const isA = message.speaker_idx === 0;
  const side = isA ? 'a' : 'b';
  const initial = message.speaker ? message.speaker.charAt(0).toUpperCase() : (isA ? 'A' : 'B');
  const elapsed = message.elapsed_seconds;

  return (
    <div className={`message-row speaker-${side}`}>
      <div className={`avatar avatar-${side}`}>
        {initial}
      </div>
      <div className={`message-bubble bubble-${side}`}>
        <div className="message-speaker">{message.speaker}</div>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.text}
        </ReactMarkdown>
        {showResponseTime && elapsed > 0 && (
          <div className="message-elapsed">{elapsed.toFixed(1)}s</div>
        )}
      </div>
    </div>
  );
}
