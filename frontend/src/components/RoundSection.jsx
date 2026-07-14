import React, { useCallback, useMemo } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import OrchestratorMessage from './OrchestratorMessage';
import CollapsibleResponse from './CollapsibleResponse';
import { speakerStatsForRound } from '../utils/rounds';
import { HUMAN_TONE, PARTICIPANT_PALETTE } from '../constants/brandColors';
import '../neon/neon-material.register.js';

/**
 * MD3 expansion panel for one conversation round (phase).
 * Live rounds keep the body open; individual replies still use two-line
 * previews (same as completed rounds). Collapsed headers show avatar stacks.
 * Vote ballot / result UI lives in VotePanel — not here.
 */
export default function RoundSection({
  round,
  expanded,
  onToggle,
  expandedMessages,
  onToggleMessage,
  speakerIdxFor,
  participantNameById,
  showResponseTime,
  globalMessageOffset = 0,
  liveRound = false,
}) {
  const handleHeaderClick = useCallback(() => {
    if (liveRound) return;
    onToggle(round.key);
  }, [liveRound, onToggle, round.key]);

  const countLabel = round.participantCount === 1
    ? '1 response'
    : `${round.participantCount} responses`;

  const speakerStats = useMemo(
    () => speakerStatsForRound(round),
    [round],
  );

  /** Roster-ordered avatars with replied vs missed status for the header stack. */
  const avatarPeople = useMemo(() => {
    const repliedById = new Map(speakerStats.map((s) => [s.speaker_id, s]));
    const rosterIds = Object.keys(speakerIdxFor || {}).sort(
      (a, b) => (speakerIdxFor[a] ?? 0) - (speakerIdxFor[b] ?? 0),
    );

    if (rosterIds.length === 0) {
      return speakerStats.map((s) => ({
        speaker_id: s.speaker_id,
        name: s.name,
        replied: true,
      }));
    }

    return rosterIds.map((id) => {
      const replied = repliedById.get(id);
      return {
        speaker_id: id,
        name: participantNameById?.[id] || replied?.name || id,
        replied: Boolean(replied),
      };
    });
  }, [speakerStats, speakerIdxFor, participantNameById]);

  const showBody = expanded || liveRound;
  const showAvatarStack = !showBody && avatarPeople.length > 0;

  return (
    <div
      className={[
        'ccai-round-section',
        'md-chat-round',
        showBody ? 'is-expanded' : '',
        liveRound ? 'is-live' : '',
        round.hasReport ? 'has-report' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className="ccai-round-header md-chat-round-header"
        onClick={handleHeaderClick}
        aria-expanded={showBody}
        disabled={liveRound || undefined}
      >
        <ChevronRight
          size={18}
          className={`ccai-round-chevron${showBody ? ' is-expanded' : ''}`}
          aria-hidden
        />
        <span className="ccai-round-header-main">
          <span className="ccai-round-label">{round.label}</span>
          {showAvatarStack && (
            <span className="ccai-round-avatar-stack" aria-label="Participant reply status">
              {avatarPeople.map((s) => {
                const idx = speakerIdxFor[s.speaker_id] ?? 0;
                const isHuman = participantNameById?.[s.speaker_id]
                  && round.messages.some(
                    (m) => m.speaker_id === s.speaker_id
                      && (m.kind === 'human' || m.model_display === 'Human participant'),
                  );
                const tone = isHuman
                  ? HUMAN_TONE
                  : PARTICIPANT_PALETTE[idx % PARTICIPANT_PALETTE.length];
                const initial = (s.name || '?').charAt(0).toUpperCase();
                const statusLabel = s.replied
                  ? `${s.name} replied`
                  : `${s.name} did not reply`;
                return (
                  <span
                    key={s.speaker_id}
                    className="ccai-round-avatar"
                    title={statusLabel}
                    style={{ backgroundColor: tone.color }}
                  >
                    <span className="ccai-round-avatar-initial" aria-hidden>{initial}</span>
                    <span
                      className={
                        'ccai-round-avatar-badge'
                        + (s.replied
                          ? ' ccai-round-avatar-badge--replied'
                          : ' ccai-round-avatar-badge--missed')
                      }
                      aria-label={statusLabel}
                    >
                      {s.replied ? (
                        <Check size={10} strokeWidth={3} aria-hidden />
                      ) : (
                        <X size={10} strokeWidth={3} aria-hidden />
                      )}
                    </span>
                  </span>
                );
              })}
            </span>
          )}
        </span>
        {(!showAvatarStack || avatarPeople.length === 0) && (
          <md-assist-chip className="ccai-round-count-chip" label={countLabel}>
            {countLabel}
          </md-assist-chip>
        )}
        {(liveRound || round.isStreaming) && (
          <md-assist-chip className="ccai-round-live-chip" label="Live">
            Live
          </md-assist-chip>
        )}
      </button>

      {showBody && (
        <div className="ccai-round-body md-chat-round-body">
          <md-divider className="md-chat-round-divider" />
          {round.messages.map((msg, i) => {
            const messageIdx = globalMessageOffset + i;
            if (msg.role === 'system') {
              return (
                <div
                  key={msg.message_id || `sys-inline-${round.key}-${i}`}
                  className="system-message md-chat-system"
                >
                  {msg.text}
                </div>
              );
            }
            if (msg.role === 'orchestrator') {
              return (
                <OrchestratorMessage
                  key={msg.message_id || `orch-${round.key}-${i}`}
                  message={msg}
                  messageIdx={messageIdx}
                />
              );
            }
            const idx = speakerIdxFor[msg.speaker_id] ?? messageIdx;
            const prev = i > 0 ? round.messages[i - 1] : null;
            const messageKey = msg.message_id || `msg-${messageIdx}`;
            return (
              <CollapsibleResponse
                key={messageKey}
                message={msg}
                idx={idx}
                messageIdx={messageIdx}
                prevMessage={prev}
                participantNameById={participantNameById}
                showResponseTime={showResponseTime}
                expanded={expandedMessages.has(messageKey)}
                onToggle={onToggleMessage}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
