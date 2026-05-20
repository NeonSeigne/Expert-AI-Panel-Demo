import React, { useEffect, useRef, useMemo } from 'react';
import MessageBubble from './MessageBubble';

export default function ChatArea({ messages, systemMessages, isRunning, statusText, showResponseTime, showChatStats }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, systemMessages]);

  const hasContent = messages.length > 0 || systemMessages.length > 0;
  const chatEnded = systemMessages.some(s => s.text === 'End of Chat');

  const stats = useMemo(() => {
    if (!chatEnded || messages.length === 0) return null;
    const totalTime = messages.reduce((sum, m) => sum + (m.elapsed_seconds || 0), 0);
    return { count: messages.length, totalTime: totalTime.toFixed(1) };
  }, [chatEnded, messages]);

  return (
    <div className="chat-area">
      {!hasContent && !isRunning && (
        <div className="chat-empty">
          Select two LLMs, configure expert personas, and start a conversation.
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} showResponseTime={showResponseTime} />
      ))}

      {systemMessages.map((sys, i) => (
        <div
          key={`sys-${i}`}
          className={`system-message ${sys.text === 'End of Chat' ? 'end-of-chat' : ''}`}
        >
          {sys.text}
        </div>
      ))}

      {showChatStats && stats && (
        <div className="chat-stats">
          {stats.count} messages &middot; {stats.totalTime}s total generation time
        </div>
      )}

      {isRunning && statusText && (
        <div className="status-bar">
          <div className="spinner" />
          <span>{statusText}</span>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
