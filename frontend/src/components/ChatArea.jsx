import React, { useMemo } from 'react';
import { Table2, FileText, FileCode, FileSpreadsheet, History } from 'lucide-react';
import MessageBubble from './MessageBubble';
import OrchestratorMessage from './OrchestratorMessage';
import FailsafePauseBanner from './FailsafePauseBanner';
import HumanInputSlot from './HumanInputSlot';
import HumanTurnIndicator from './HumanTurnIndicator';
import { DEFAULT_DEMO_PERSONAS, DEFAULT_PARTICIPANT_IDS } from '../utils/storage';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';

/** Update when the Neon contact destination changes on the redesigned site. */
const NEON_CONTACT_URL = 'https://www.neon.ai/contact';

const [ELENA_ID, MARCUS_ID, AMIRA_ID] = DEFAULT_PARTICIPANT_IDS;

/** Dialogue-only turns for the empty-state sample; speaker ids come from the demo trio. */
const SAMPLE_PREVIEW_TURNS = [
  {
    kind: 'orchestrator',
    text:
      'Question: Should a company build its own AI system or rely on a third-party provider? '
      + 'Each participant: share your initial view.',
  },
  {
    kind: 'participant',
    speakerId: ELENA_ID,
    text:
      'Third-party APIs keep upfront cost low, but per-seat and per-token fees compound fast at scale — '
      + 'above a few million in annual AI spend, owning the stack often wins on total cost over three to five years.',
  },
  {
    kind: 'participant',
    speakerId: MARCUS_ID,
    text:
      'Build gives you control over models, prompts, and integrations; buy gets you to production in weeks. '
      + "I'd only build if the product is the AI itself, not if AI is supporting something else.",
  },
  {
    kind: 'participant',
    speakerId: AMIRA_ID,
    addressedTo: MARCUS_ID,
    replyingTo: [MARCUS_ID],
    text:
      'Where data lives matters more than who hosts the model. A vendor with strong certifications can beat a sloppy '
      + 'in-house deployment — but regulated workloads need clarity on retention, subprocessors, and whether prompts leave your boundary.',
  },
  {
    kind: 'orchestrator',
    text:
      'No single answer fits every company — the panel leans toward buy for speed and lower early risk, build when AI is '
      + 'core IP or scale makes vendor fees dominate, with privacy and compliance as the tiebreaker.',
  },
];

function buildSamplePreviewMessages(nameById) {
  return SAMPLE_PREVIEW_TURNS.map((turn) => {
    if (turn.kind === 'orchestrator') {
      return { kind: 'orchestrator', text: turn.text };
    }
    const speaker_id = turn.speakerId;
    return {
      kind: 'participant',
      role: 'participant',
      speaker_id,
      speaker_name: nameById[speaker_id] || '',
      text: turn.text,
      ...(turn.addressedTo
        ? { addressed_to: turn.addressedTo, replying_to: turn.replyingTo }
        : {}),
    };
  });
}

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
export default function ChatArea() {
  const { showResponseTime, showChatStats } = useSettings();
  const { hasEnoughParticipantsToStart } = useParticipants();
  const {
    messages,
    systemMessages,
    isRunning,
    statusText,
    pause,
    handleContinuePause: onContinuePause,
    rosterParticipants: participants,
    awaitingHuman,
    humanSubmitting,
    handleHumanSubmit: onHumanSubmit,
    handleHumanSkip: onHumanSkip,
    handleShowTableView: onShowTableView,
    handleDownloadTxt: onDownloadChatTxt,
    handleDownloadMd: onDownloadChatMd,
    handleDownloadCsvTable: onDownloadCsvTable,
    handleDownloadApiLog: onDownloadApiLog,
    hasApiLog,
  } = useChatSession();
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

  const defaultDemoNameById = useMemo(() => {
    const m = {};
    DEFAULT_DEMO_PERSONAS.forEach((p) => {
      m[p.participant_id] = p.name;
    });
    return m;
  }, []);

  /** Names for sample bubbles: live roster when present, else catalog mirror in storage. */
  const previewNameById = useMemo(() => {
    const m = { ...defaultDemoNameById };
    DEFAULT_PARTICIPANT_IDS.forEach((id) => {
      if (participantNameById[id]) m[id] = participantNameById[id];
    });
    return m;
  }, [defaultDemoNameById, participantNameById]);

  /** Palette index: match sidebar roster order, fall back to default trio order. */
  const previewSpeakerIdxFor = useMemo(() => {
    const map = {};
    DEFAULT_PARTICIPANT_IDS.forEach((id, defaultIdx) => {
      map[id] = speakerIdxFor[id] ?? defaultIdx;
    });
    return map;
  }, [speakerIdxFor]);

  const samplePreviewMessages = useMemo(
    () => buildSamplePreviewMessages(previewNameById),
    [previewNameById],
  );

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
          <div className="chat-empty-copy">
            <p className="chat-empty-lead">
              Watch a panel of AI experts debate a question, challenge each other, and reason toward a more considered answer.
            </p>
            <p className="chat-empty-instruction">
              {hasEnoughParticipantsToStart
                ? 'Three expert personas are ready to go — press Start Chat, or add, remove, or edit them to fit your question.'
                : 'Add at least 2 participants from the header dropdown, then start a conversation.'}
            </p>
          </div>
          <div className="chat-empty-sample" aria-hidden="true">
            <p className="chat-empty-sample-label">Sample preview — not a live result</p>
            <div className="chat-empty-sample-panel">
              {samplePreviewMessages.map((msg, i) => {
                if (msg.kind === 'orchestrator') {
                  return (
                    <OrchestratorMessage
                      key={`preview-orch-${i}`}
                      message={{ text: msg.text }}
                      messageIdx={i}
                    />
                  );
                }
                const prev = i > 0 ? samplePreviewMessages[i - 1] : null;
                const prevParticipant =
                  prev?.kind === 'participant' ? prev : null;
                return (
                  <MessageBubble
                    key={`preview-${msg.speaker_id}-${i}`}
                    message={msg}
                    idx={previewSpeakerIdxFor[msg.speaker_id] ?? 0}
                    messageIdx={i}
                    prevMessage={prevParticipant}
                    participantNameById={previewNameById}
                    showResponseTime={false}
                  />
                );
              })}
            </div>
          </div>
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
        <div className="chat-end-bar">
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
          <p className="chat-end-cta">
            Want a panel like this running on your own infrastructure?{' '}
            <a
              href={NEON_CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Talk to Neon
            </a>
          </p>
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
