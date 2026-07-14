import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoundSection from './RoundSection';
import FailsafePauseBanner from './FailsafePauseBanner';
import HumanInputSlot from './HumanInputSlot';
import HumanTurnIndicator from './HumanTurnIndicator';
import ChatControls from './ChatControls';
import WelcomeParticipantPills from './WelcomeParticipantPills';
import ChatWrapUp from './ChatWrapUp';
import VotePanel from './decision/VotePanel';
import NeonDesignRoot from './NeonDesignRoot';
import NeonChatBubble from '../neon/NeonChatBubble';
import { useSettings } from '../context/SettingsContext';
import { useChatSession } from '../context/ChatSessionContext';
import { useParticipants } from '../context/ParticipantsContext';
import { groupMessagesIntoRounds } from '../utils/rounds';
import {
  findBallotMessage,
  findVoteDecisionFromMessages,
  isVoteDecision,
  isVotePanelMessage,
} from '../utils/voteUi';
import '../neon/neon-material.register.js';

import { BRAND_NEON_BLUE } from '../constants/brandColors';

const QUESTION_AVATAR_COLOR = BRAND_NEON_BLUE;

/**
 * Conversation feed as MD3 surfaces (rounds, bubbles, orch, status, reliability).
 */
export default function ChatArea({ showCenteredComposer = false }) {
  const { showResponseTime, showChatStats } = useSettings();
  const {
    messages,
    systemMessages,
    isRunning,
    statusText,
    pause,
    activeQuestion,
    handleContinuePause: onContinuePause,
    rosterParticipants: participants,
    awaitingHuman,
    humanSubmitting,
    handleHumanSubmit: onHumanSubmit,
    handleHumanSkip: onHumanSkip,
    handleShowCredentials,
    handleStop,
    handleStartNewChat,
    hasContent,
    activeHistoryId,
    savedDecision,
    savedRows,
  } = useChatSession();
  const { humanParticipant } = useParticipants();

  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [collapsedReportKeys, setCollapsedReportKeys] = useState(() => new Set());
  const [expandedMessages, setExpandedMessages] = useState(() => new Set());
  const chatAreaRef = useRef(null);
  const liveDockRoundRef = useRef(null);

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

  const ballotMessage = useMemo(
    () => findBallotMessage(messages || []),
    [messages],
  );

  const voteDecision = useMemo(() => {
    if (isVoteDecision(savedDecision)) return savedDecision;
    return findVoteDecisionFromMessages(messages || []);
  }, [savedDecision, messages]);

  const transcriptMessages = useMemo(
    () => (messages || []).filter((m) => !isVotePanelMessage(m)),
    [messages],
  );

  const rounds = useMemo(
    () => groupMessagesIntoRounds(transcriptMessages),
    [transcriptMessages],
  );

  const roundOffsets = useMemo(() => {
    const offsets = {};
    let offset = 0;
    for (const round of rounds) {
      offsets[round.key] = offset;
      offset += round.messages.length;
    }
    return offsets;
  }, [rounds]);

  const handleToggleSection = useCallback((key) => {
    const round = rounds.find((r) => r.key === key);
    const isReport = Boolean(round?.hasReport);
    const currentlyExpanded = isReport
      ? !collapsedReportKeys.has(key)
      : expandedSections.has(key);

    if (isReport) {
      setCollapsedReportKeys((prev) => {
        const next = new Set(prev);
        if (currentlyExpanded) next.add(key);
        else next.delete(key);
        return next;
      });
    } else {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (currentlyExpanded) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }, [rounds, expandedSections, collapsedReportKeys]);

  const handleToggleMessage = useCallback((messageKey) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageKey)) next.delete(messageKey);
      else next.add(messageKey);
      return next;
    });
  }, []);

  const activeRoundKey = isRunning && rounds.length > 0
    ? rounds[rounds.length - 1].key
    : null;

  const completedRounds = useMemo(
    () => {
      const base = activeRoundKey
        ? rounds.filter((r) => r.key !== activeRoundKey)
        : rounds;
      return base.filter((r) => r.messages.length > 0);
    },
    [rounds, activeRoundKey],
  );

  const activeRound = useMemo(
    () => (activeRoundKey
      ? rounds.find((r) => r.key === activeRoundKey) || null
      : null),
    [rounds, activeRoundKey],
  );

  /** Skip empty live dock when the active phase is only vote UI (handled by VotePanel). */
  const showLiveRound = Boolean(activeRound && activeRound.messages.length > 0);

  /** Stable key of live-round replies — used to follow new messages into view. */
  const liveFollowKey = useMemo(() => {
    if (!activeRound) return '';
    return activeRound.messages
      .map((m) => m.message_id || `${m.role}:${m.speaker_id || ''}:${m.kind || ''}`)
      .join('|');
  }, [activeRound]);

  useEffect(() => {
    if (!isRunning || awaitingHuman) return undefined;
    const scrollToLatest = () => {
      const dock = liveDockRoundRef.current;
      if (dock) {
        const body = dock.querySelector('.md-chat-round-body, .ccai-round-body');
        if (body) body.scrollTop = body.scrollHeight;
        else dock.scrollTop = dock.scrollHeight;
      }
      const area = chatAreaRef.current;
      if (area) area.scrollTop = area.scrollHeight;
    };
    scrollToLatest();
    // Layout may settle after paint (avatars / MD chips); one more pass next frame.
    const raf = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(raf);
  }, [isRunning, awaitingHuman, liveFollowKey, activeRoundKey, completedRounds.length]);

  const isRoundExpanded = useCallback((round) => {
    if (round.hasReport) return !collapsedReportKeys.has(round.key);
    return expandedSections.has(round.key);
  }, [expandedSections, collapsedReportKeys]);

  const chatEnded = (systemMessages || []).some(s => s.text === 'End of Chat');

  const liveSummary = useMemo(() => {
    if (!isRunning || awaitingHuman) return null;
    const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const streamingNames = (messages || [])
      .filter((m) => m.streaming && (m.speaker_name || m.role === 'participant'))
      .map((m) => m.speaker_name)
      .filter(Boolean);
    const uniqueStreaming = [...new Set(streamingNames)];
    const phaseLabel = latestRound?.label || null;
    let speakersLine = 'Waiting for next speaker';
    if (uniqueStreaming.length === 1) {
      speakersLine = `${uniqueStreaming[0]} is responding`;
    } else if (uniqueStreaming.length > 1) {
      speakersLine = `${uniqueStreaming.join(', ')} are responding`;
    }
    return {
      phaseLabel,
      speakersLine,
      secondary: phaseLabel ? `${phaseLabel} · ${speakersLine}` : speakersLine,
    };
  }, [isRunning, awaitingHuman, rounds, messages]);

  const questionSpeakerName = humanParticipant?.name || 'You';

  return (
    <div
      ref={chatAreaRef}
      className={`chat-area${showCenteredComposer ? ' chat-area--welcome' : ''}`}
    >
      {showCenteredComposer && (
        <div className="chat-empty">
          <h2 className="chat-empty-headline">Ask Anything....</h2>
          <WelcomeParticipantPills />
          <div className="chat-empty-composer">
            <ChatControls centered />
          </div>
        </div>
      )}
      <NeonDesignRoot className="chat-area-md">
        <div className="chat-area-messages">
          {activeQuestion && (
            <NeonChatBubble
              side="User"
              senderName={questionSpeakerName}
              content={activeQuestion}
              markdown={false}
              avatarKind="user"
              avatarLabel={questionSpeakerName.charAt(0).toUpperCase()}
              avatarColor={QUESTION_AVATAR_COLOR}
              rowClassName="ccai-question-bubble"
            />
          )}
          {completedRounds.map((round) => (
            <RoundSection
              key={round.key}
              round={round}
              expanded={isRoundExpanded(round)}
              onToggle={handleToggleSection}
              expandedMessages={expandedMessages}
              onToggleMessage={handleToggleMessage}
              speakerIdxFor={speakerIdxFor}
              participantNameById={participantNameById}
              showResponseTime={showResponseTime}
              globalMessageOffset={roundOffsets[round.key] || 0}
              liveRound={false}
            />
          ))}
          <VotePanel
            ballotMessage={ballotMessage}
            decision={voteDecision}
            speakerIdxFor={speakerIdxFor}
            participantNameById={participantNameById}
          />
        </div>
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
            className={`system-message md-chat-system ${sys.text === 'End of Chat' ? 'end-of-chat' : ''}`}
          >
            {sys.text}
          </div>
        ))}
        {chatEnded && (
          <ChatWrapUp
            messages={messages}
            decision={savedDecision}
            voteDecision={voteDecision}
            rows={savedRows}
            speakerIdxFor={speakerIdxFor}
            showChatStats={showChatStats}
            onOpenCredentials={handleShowCredentials}
          />
        )}
        {activeHistoryId && !isRunning && (
          <div className="system-message md-chat-system">
            Viewing a saved chat. Start a new chat to ask another question.
          </div>
        )}
        {!isRunning && hasContent && (
          <div className="chat-start-new-wrap">
            <button
              type="button"
              className="btn-primary chat-start-new-btn"
              onClick={handleStartNewChat}
            >
              Start new chat
            </button>
          </div>
        )}
        <FailsafePauseBanner pause={pause} onContinue={onContinuePause} />
        {isRunning && (
          <div className="md-chat-live-dock">
            {showLiveRound && (
              <div
                ref={liveDockRoundRef}
                className="md-chat-live-dock-round"
                aria-live="polite"
                aria-label="Live round"
              >
                <RoundSection
                  key={activeRound.key}
                  round={activeRound}
                  expanded
                  onToggle={handleToggleSection}
                  expandedMessages={expandedMessages}
                  onToggleMessage={handleToggleMessage}
                  speakerIdxFor={speakerIdxFor}
                  participantNameById={participantNameById}
                  showResponseTime={showResponseTime}
                  globalMessageOffset={roundOffsets[activeRound.key] || 0}
                  liveRound
                />
              </div>
            )}
            <div className="status-bar md-chat-status" role="status" aria-live="polite">
              <div className="md-chat-status-main">
                {!awaitingHuman && (statusText || liveSummary) ? (
                  <>
                    <md-linear-progress indeterminate className="md-chat-status-progress" />
                    <div className="status-bar-copy">
                      <span className="status-bar-primary">
                        {statusText || 'Conversation in progress…'}
                      </span>
                      {liveSummary?.secondary && (
                        <span className="status-bar-secondary">{liveSummary.secondary}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="status-bar-copy">
                    <span className="status-bar-primary">
                      {awaitingHuman ? 'Waiting for your response…' : 'Conversation in progress…'}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn-stop md-chat-status-stop"
                onClick={handleStop}
                aria-label="Stop chat"
                title="Stop chat"
              >
                <span className="btn-stop__square" aria-hidden />
              </button>
            </div>
          </div>
        )}
        <HumanTurnIndicator awaiting={awaitingHuman} />
      </NeonDesignRoot>
    </div>
  );
}
