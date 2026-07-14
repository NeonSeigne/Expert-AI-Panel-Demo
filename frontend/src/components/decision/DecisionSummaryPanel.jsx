import React from 'react';
import ConsensusAllianceBoard from './ConsensusAllianceBoard';
import '../../neon/neon-material.register.js';

const CONSENSUS_KINDS = new Set(['majority', 'no_consensus']);

function titleFor(decision) {
  if (!decision) return 'Decision summary';
  if (decision.kind === 'majority') return 'Consensus · Majority';
  if (decision.kind === 'no_consensus') return 'Consensus · No agreement';
  return 'Decision summary';
}

/**
 * End-of-chat structured decision board.
 * Vote results render in the standalone VotePanel (live → result);
 * this panel handles consensus alliances only.
 */
export default function DecisionSummaryPanel({ decision, rows }) {
  if (!decision || !decision.kind) return null;

  const isConsensus = CONSENSUS_KINDS.has(decision.kind);
  if (!isConsensus) return null;

  return (
    <section
      className="ccai-decision-summary md-chat-decision"
      aria-label="Decision summary"
    >
      <div className="ccai-decision-summary-title">{titleFor(decision)}</div>
      <ConsensusAllianceBoard decision={decision} rows={rows} />
    </section>
  );
}
