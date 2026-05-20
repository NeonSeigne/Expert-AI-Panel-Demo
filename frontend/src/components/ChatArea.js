import React, { useEffect, useRef, useMemo } from 'react';
import MessageBubble from './MessageBubble';
import OrchestratorMessage from './OrchestratorMessage';
import FailsafePauseBanner from './FailsafePauseBanner';

/**
 * Renders the conversation: a mix of participant bubbles, orchestrator
 * status banners, and the failsafe-pause continue control. Participant
 * coloring is derived from each participant's index in the active
 * roster, so colors are stable per-participant for the whole chat.
 */
export default function ChatArea({
  messages,
  systemMessages,
  isRunning,
  statusText,
  pause,
  onContinuePause,
  participants,
  showResponseTime,
  showChatStats,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, systemMessages, statusText, pause]);

  const speakerIdxFor = useMemo(() => {
    const map = {};
    (participants || []).forEach((p, i) => {
      map[p.participant_id] = i;
    });
    return map;
  }, [participants]);

  const hasContent = (messages?.length || 0) + (systemMessages?.length || 0) > 0;
  const chatEnded = (systemMessages || []).some(s => s.text === 'End of Chat');

  const stats = useMemo(() => {
    if (!chatEnded || !messages || messages.length === 0) return null;
    const participantMsgs = messages.filter(m => m.role !== 'orchestrator');
    const totalTime = participantMsgs.reduce(
      (sum, m) => sum + (m.elapsed_seconds || 0), 0,
    );
    return { count: participantMsgs.length, totalTime: totalTime.toFixed(1) };
  }, [chatEnded, messages]);

  return (
    <div className="chat-area">
      {!hasContent && !isRunning && (
        <div className="chat-empty">
          Add at least 2 participants from the header dropdown, then start a conversation.
        </div>
      )}
      {(messages || []).map((msg, i) => {
        if (msg.role === 'orchestrator') {
          return <OrchestratorMessage key={i} message={msg} />;
        }
        const idx = speakerIdxFor[msg.speaker_id] ?? i;
        return (
          <MessageBubble
            key={i}
            message={msg}
            idx={idx}
            showResponseTime={showResponseTime}
          />
        );
      })}
      {(systemMessages || []).map((sys, i) => (
        <div
          key={`sys-${i}`}
          className={`system-message ${sys.text === 'End of Chat' ? 'end-of-chat' : ''}`}
        >
          {sys.text}
        </div>
      ))}
      {showChatStats && stats && (
        <div className="chat-stats">
          {stats.count} participant messages &middot; {stats.totalTime}s total generation time
        </div>
      )}
      <FailsafePauseBanner pause={pause} onContinue={onContinuePause} />
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
