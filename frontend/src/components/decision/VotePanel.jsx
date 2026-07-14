import React from 'react';
import LiveBallotCard from './LiveBallotCard';
import VoteBoard from './VoteBoard';
import { isVoteDecision } from '../../utils/voteUi';
import '../../neon/neon-material.register.js';

/**
 * Standalone (non-collapsible) vote surface:
 * live ballot while votes cast → structured VoteBoard result once available.
 */
export default function VotePanel({
  ballotMessage,
  decision,
  speakerIdxFor,
  participantNameById,
}) {
  const hasDecision = isVoteDecision(decision)
    && (
      Array.isArray(decision.ballots)
      || decision.tally
      || decision.irv
      || Array.isArray(decision.options)
    );

  const isLive = Boolean(ballotMessage) && !hasDecision;

  if (!ballotMessage && !hasDecision) return null;

  return (
    <section
      className={[
        'ccai-vote-panel',
        'md-chat-vote-panel',
        hasDecision ? 'is-result' : 'is-live',
        isLive ? 'is-hero' : '',
      ].filter(Boolean).join(' ')}
      aria-label={hasDecision ? 'Vote result' : 'Live ballot'}
    >
      {hasDecision ? (
        <>
          <div className="ccai-vote-panel-title">Vote result</div>
          <VoteBoard
            decision={decision}
            speakerIdxFor={speakerIdxFor}
            participantNameById={participantNameById}
          />
        </>
      ) : (
        <LiveBallotCard
          message={ballotMessage}
          speakerIdxFor={speakerIdxFor}
          participantNameById={participantNameById}
        />
      )}
    </section>
  );
}
