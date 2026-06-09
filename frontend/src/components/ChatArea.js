import React, { useMemo } from 'react';
import { Table2, FileText, FileCode, FileSpreadsheet, History } from 'lucide-react';
import MessageBubble from './MessageBubble';
import OrchestratorMessage from './OrchestratorMessage';
import FailsafePauseBanner from './FailsafePauseBanner';
import HumanInputSlot from './HumanInputSlot';
import HumanTurnIndicator from './HumanTurnIndicator';

/**
 * Renders the conversation: a mix of participant bubbles, orchestrator
 * status banners, and the failsafe-pause continue control. Participant
 * coloring is derived from each participant's index in the active
 * roster, so colors are stable per-participant for the whole chat.
 *
 * After "End of Chat" arrives we also render a download strip below the
 * stats line that mirrors the header DownloadMenu items 1:1 (Summary
 * table view, .txt, .md, .csv, full API log). Per UX request these
 * stack vertically on narrow viewports.
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
  awaitingHuman,
  humanSubmitting,
  onHumanSubmit,
  onHumanSkip,
  onShowTableView,
  onDownloadChatTxt,
  onDownloadChatMd,
  onDownloadCsvTable,
  onDownloadApiLog,
  hasApiLog,
}) {
  const speakerIdxFor = useMemo(() => {
    const map = {};
    (participants || []).forEach((p, i) => {
      map[p.participant_id] = i;
    });
    return map;
  }, [participants]);

  const participantNameById = useMemo(() => {
    const m = {};
    (participants || []).forEach((p) => {
      m[p.participant_id] = p.name;
    });
    return m;
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
        if (msg.role === 'system') {
          return (
            <div key={msg.message_id || `sys-inline-${i}`} className="system-message">
              {msg.text}
            </div>
          );
        }
        if (msg.role === 'orchestrator') {
          return <OrchestratorMessage key={msg.message_id || i} message={msg} messageIdx={i} />;
        }
        const idx = speakerIdxFor[msg.speaker_id] ?? i;
        const prev = i > 0 ? messages[i - 1] : null;
        return (
          <MessageBubble
            key={i}
            message={msg}
            idx={idx}
            messageIdx={i}
            prevMessage={prev}
            participantNameById={participantNameById}
            showResponseTime={showResponseTime}
          />
        );
      })}
      {awaitingHuman && (
        <div data-human-slot>
          <HumanInputSlot
            awaiting={awaitingHuman}
            sending={humanSubmitting}
            onSubmit={onHumanSubmit}
            onSkip={onHumanSkip}
            allowSkip
          />
        </div>
      )}
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
      {chatEnded && (
        <div className="chat-end-downloads" role="group" aria-label="Conversation downloads">
          <button
            type="button"
            className="btn-sm btn-outline chat-end-download-btn"
            onClick={onShowTableView}
            title="Open the conversation summary table"
          >
            <Table2 size={14} />
            Summary table…
          </button>
          <button
            type="button"
            className="btn-sm btn-outline chat-end-download-btn"
            onClick={onDownloadChatTxt}
          >
            <FileText size={14} />
            Chat as .txt
          </button>
          <button
            type="button"
            className="btn-sm btn-outline chat-end-download-btn"
            onClick={onDownloadChatMd}
          >
            <FileCode size={14} />
            Chat as .md
          </button>
          <button
            type="button"
            className="btn-sm btn-outline chat-end-download-btn"
            onClick={onDownloadCsvTable}
            title="Download the summary table as CSV"
          >
            <FileSpreadsheet size={14} />
            Summary table as .csv
          </button>
          <button
            type="button"
            className="btn-sm btn-outline chat-end-download-btn"
            onClick={onDownloadApiLog}
            disabled={!hasApiLog}
            title="Download the full backend API call history for this session"
          >
            <History size={14} />
            Full API history
          </button>
        </div>
      )}
      <FailsafePauseBanner pause={pause} onContinue={onContinuePause} />
      {isRunning && statusText && !awaitingHuman && (
        <div className="status-bar">
          <div className="spinner" />
          <span>{statusText}</span>
        </div>
      )}
      <HumanTurnIndicator awaiting={awaitingHuman} />
    </div>
  );
}
