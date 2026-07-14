import React, { useEffect, useRef, useState } from 'react';
import { Vote } from 'lucide-react';
import NeonAvatar from '../../neon/NeonAvatar';
import { AVATAR_PALETTE, HUMAN_COLOR } from '../../constants/brandColors';

const MOTION_OPTIONS = ['Aye', 'Nay', 'Abstain'];

function isMotionKind(kind) {
  return kind === 'motion';
}

function resolveOptions(message) {
  if (isMotionKind(message?.kind)) return MOTION_OPTIONS;
  if (Array.isArray(message?.options) && message.options.length > 0) {
    return message.options;
  }
  return [];
}

/** Which option index (0-based) a ballot maps to, or -1 if none. */
function ballotOptionIndex(ballot, options, isMotion) {
  if (!ballot) return -1;
  if (isMotion) {
    const vote = String(ballot.vote || '').toLowerCase();
    if (vote === 'aye') return 0;
    if (vote === 'nay') return 1;
    return 2; // abstain / invalid / empty
  }
  if (Array.isArray(ballot.ranking) && ballot.ranking.length > 0) {
    const first = Number(ballot.ranking[0]);
    if (first >= 1 && first <= options.length) return first - 1;
    return -1;
  }
  if (typeof ballot.choice === 'number' && ballot.choice > 0) {
    const idx = ballot.choice - 1;
    return idx < options.length ? idx : -1;
  }
  return -1;
}

function isRankedBallot(ballot) {
  return Array.isArray(ballot?.ranking) && ballot.ranking.length > 0;
}

function isHumanBallot(ballot) {
  return Boolean(
    ballot?.is_human
    || ballot?.model_display === 'Human participant',
  );
}

function VoterChip({
  ballot,
  speakerIdxFor,
  participantNameById,
  animate,
  showRankBadge,
}) {
  const voterId = ballot.voter_id;
  const name = ballot.voter_name
    || participantNameById?.[voterId]
    || 'Voter';
  const idx = speakerIdxFor?.[voterId] ?? 0;
  const human = isHumanBallot(ballot);
  const initial = name.charAt(0).toUpperCase();
  const bg = human
    ? HUMAN_COLOR
    : AVATAR_PALETTE[idx % AVATAR_PALETTE.length];

  return (
    <span
      className={`ccai-live-ballot-chip${animate ? ' is-entering' : ''}`}
      title={name}
      role="img"
      aria-label={showRankBadge ? `${name}, first preference` : name}
    >
      {human ? (
        <NeonAvatar kind="user" size="sm" />
      ) : (
        <NeonAvatar
          kind="initial"
          size="sm"
          label={initial}
          backgroundColor={bg}
        />
      )}
      {showRankBadge ? (
        <span className="ccai-live-ballot-chip-rank">#1</span>
      ) : null}
    </span>
  );
}

/**
 * Live ballot / motion card: options as rows; persona chips appear as votes cast.
 */
export default function LiveBallotCard({
  message,
  speakerIdxFor = {},
  participantNameById = {},
}) {
  const options = resolveOptions(message);
  const isMotion = isMotionKind(message?.kind);
  const ballots = Array.isArray(message?.ballots) ? message.ballots : [];
  const voteComplete = Boolean(message?.vote_complete);
  const rootRef = useRef(null);
  const scrolledForRef = useRef(null);
  const prevCountRef = useRef(0);
  const [enteringKeys, setEnteringKeys] = useState(() => new Set());
  const [entered, setEntered] = useState(false);

  const ballotKey = message?.id
    || message?.message_id
    || `${message?.kind}-${options.join('|')}-${message?.motion || ''}`;

  useEffect(() => {
    if (!ballotKey || scrolledForRef.current === ballotKey) return undefined;
    scrolledForRef.current = ballotKey;
    const t = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setEntered(true);
    }, 40);
    return () => window.clearTimeout(t);
  }, [ballotKey]);

  useEffect(() => {
    const prev = prevCountRef.current;
    if (ballots.length > prev) {
      const next = new Set();
      for (let i = prev; i < ballots.length; i += 1) {
        const b = ballots[i];
        next.add(b.voter_id || `${b.voter_name}-${i}`);
      }
      setEnteringKeys(next);
      const t = window.setTimeout(() => setEnteringKeys(new Set()), 600);
      prevCountRef.current = ballots.length;
      return () => window.clearTimeout(t);
    }
    prevCountRef.current = ballots.length;
    return undefined;
  }, [ballots]);

  const byOption = options.map(() => []);
  ballots.forEach((b, i) => {
    const optIdx = ballotOptionIndex(b, options, isMotion);
    if (optIdx >= 0) byOption[optIdx].push({ ballot: b, index: i });
  });

  const title = isMotion ? 'Motion on the floor' : 'Ballot';
  const statusText = voteComplete
    ? 'Voting complete'
    : ballots.length === 0
      ? 'Waiting for votes…'
      : `${ballots.length} vote${ballots.length === 1 ? '' : 's'} in`;

  return (
    <div
      ref={rootRef}
      className={[
        'ccai-live-ballot',
        'md-chat-live-ballot',
        'is-hero',
        entered ? 'is-entered' : '',
        voteComplete ? 'is-complete' : '',
      ].filter(Boolean).join(' ')}
      aria-label={title}
    >
      <div className="ccai-live-ballot-header">
        <div className="ccai-live-ballot-icon-wrap" aria-hidden>
          <Vote size={22} strokeWidth={2} className="ccai-live-ballot-icon" />
        </div>
        <div className="ccai-live-ballot-header-text">
          <div className="ccai-live-ballot-title">{title}</div>
          {isMotion && message?.motion ? (
            <p className="ccai-live-ballot-motion">{message.motion}</p>
          ) : null}
          <div className="ccai-live-ballot-status" aria-live="polite">
            {statusText}
          </div>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="ccai-live-ballot-empty">No options on this ballot.</p>
      ) : (
        <ul className="ccai-live-ballot-options">
          {options.map((label, optIdx) => {
            const voters = byOption[optIdx] || [];
            return (
              <li
                key={`opt-${optIdx}`}
                className={[
                  'ccai-live-ballot-option',
                  voters.length === 0 ? 'is-empty' : 'has-votes',
                ].join(' ')}
              >
                <div className="ccai-live-ballot-option-label">
                  {!isMotion ? (
                    <span className="ccai-live-ballot-option-num">{optIdx + 1}.</span>
                  ) : null}
                  <span className="ccai-live-ballot-option-text">{label}</span>
                  <span className="ccai-live-ballot-option-count">{voters.length}</span>
                </div>
                <div className="ccai-live-ballot-chips">
                  {voters.length === 0 ? (
                    <span className="ccai-live-ballot-option-hint">No votes yet</span>
                  ) : (
                    voters.map(({ ballot, index }) => {
                      const key = ballot.voter_id || `${ballot.voter_name}-${index}`;
                      return (
                        <VoterChip
                          key={key}
                          ballot={ballot}
                          speakerIdxFor={speakerIdxFor}
                          participantNameById={participantNameById}
                          animate={enteringKeys.has(key)}
                          showRankBadge={isRankedBallot(ballot)}
                        />
                      );
                    })
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
