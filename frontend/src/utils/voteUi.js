/**
 * Vote UI helpers — ballot / result messages live in a standalone VotePanel,
 * not inside collapsible RoundSections.
 */

export function isVoteMotionMessage(msg) {
  return msg?.kind === 'motion' && !msg.mover_id;
}

/** Messages rendered only by VotePanel (excluded from round accordions). */
export function isVotePanelMessage(msg) {
  if (!msg) return false;
  if (msg.kind === 'ballot_options') return true;
  if (msg.kind === 'vote_result' || msg.kind === 'ranked_choice_result') return true;
  if (isVoteMotionMessage(msg)) return true;
  return false;
}

export function findBallotMessage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.kind === 'ballot_options' || isVoteMotionMessage(m)) return m;
  }
  return null;
}

/** Build a VoteBoard-ready decision object from the in-transcript report message. */
export function findVoteDecisionFromMessages(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.kind !== 'vote_result' && m.kind !== 'ranked_choice_result') continue;
    return {
      kind: m.kind,
      vote_kind: m.vote_kind,
      tally: m.tally,
      irv: m.irv,
      options: m.options,
      ballots: m.ballots,
      motion: m.motion,
      flavor: m.flavor,
      text: m.text,
    };
  }
  return null;
}

export function isVoteDecision(decision) {
  if (!decision?.kind) return false;
  return decision.kind === 'vote_result' || decision.kind === 'ranked_choice_result';
}
