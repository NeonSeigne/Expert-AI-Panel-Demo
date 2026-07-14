import { isVoteDecision } from './voteUi';

function toScore(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/**
 * Client-side aggregates for the end-of-chat wrap-up.
 */
export function computeWrapUpStats({
  messages = [],
  rows = [],
  decision = null,
}) {
  const participantMsgs = (messages || []).filter(
    (m) => m && m.role !== 'orchestrator' && m.role !== 'system',
  );

  const messageCount = participantMsgs.length;
  const totalTimeRaw = participantMsgs.reduce(
    (sum, m) => sum + (Number(m.elapsed_seconds) || 0),
    0,
  );

  const shareBars = buildShareBars(decision);
  const allianceBars = buildAllianceBars(decision);

  const scored = (rows || [])
    .map((r) => ({
      id: r.participant_id,
      name: r.name || 'Participant',
      score: toScore(r.credibility_for_question),
      failures: Number(r.consecutive_failures) || 0,
      model_display: r.model_display,
      contribution_summary: r.contribution_summary,
      enabled: r.enabled,
      auto_disabled: r.auto_disabled,
    }));

  const withScores = scored.filter((r) => r.score != null);
  const avgCredibility = withScores.length
    ? withScores.reduce((s, r) => s + r.score, 0) / withScores.length
    : null;
  const failureCount = scored.reduce((s, r) => s + (r.failures > 0 ? 1 : 0), 0);

  const credibilityBars = [...scored].sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  return {
    messageCount,
    totalTime: totalTimeRaw.toFixed(1),
    totalTimeRaw,
    shareBars,
    allianceBars,
    avgCredibility,
    failureCount,
    credibilityBars,
    isVote: isVoteDecision(decision),
  };
}

function buildShareBars(decision) {
  if (!decision || !isVoteDecision(decision)) return null;

  if (decision.kind === 'ranked_choice_result') {
    const options = Array.isArray(decision.options) ? decision.options : [];
    const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
    const counts = options.map(() => 0);
    for (const b of ballots) {
      const ranking = Array.isArray(b.ranking) ? b.ranking : [];
      const first = Number(ranking[0]);
      if (first >= 1 && first <= options.length) counts[first - 1] += 1;
    }
    const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
    return options.map((label, i) => ({
      label,
      count: counts[i],
      share: counts[i] / total,
    }));
  }

  if (decision.vote_kind === 'yesno' || (decision.ballots || []).some((b) => b.vote != null)) {
    const tally = decision.tally || {};
    const aye = Number(tally.aye) || 0;
    const nay = Number(tally.nay) || 0;
    const abstain = Number(tally.abstain) || 0;
    const total = Math.max(1, aye + nay + abstain);
    return [
      { label: 'Aye', count: aye, share: aye / total },
      { label: 'Nay', count: nay, share: nay / total },
      { label: 'Abstain', count: abstain, share: abstain / total },
    ];
  }

  if (decision.vote_kind === 'plurality' || Array.isArray(decision.options)) {
    const options = Array.isArray(decision.options) ? decision.options : [];
    const counts = Array.isArray(decision.tally?.counts) ? decision.tally.counts : [];
    const total = Math.max(1, counts.reduce((a, b) => a + (Number(b) || 0), 0));
    return options.map((label, i) => {
      const count = Number(counts[i]) || 0;
      return { label, count, share: count / total };
    });
  }

  return null;
}

function buildAllianceBars(decision) {
  if (!decision) return null;
  if (decision.kind !== 'majority' && decision.kind !== 'no_consensus') return null;
  const groups = Array.isArray(decision.alliance_groups) ? decision.alliance_groups : [];
  if (groups.length === 0) return null;
  const sizes = groups.map((g) => ({
    label: String(g.stance || 'Alliance').trim() || 'Alliance',
    count: Array.isArray(g.members) ? g.members.length : 0,
  }));
  const total = Math.max(1, sizes.reduce((a, b) => a + b.count, 0));
  return sizes.map((s) => ({ ...s, share: s.count / total }));
}

export function voteVerdictLabel(decision) {
  if (!decision || !isVoteDecision(decision)) return null;
  if (decision.kind === 'ranked_choice_result') {
    const winner = decision.irv?.winner;
    if (winner > 0 && Array.isArray(decision.options)) {
      return { chip: 'Winner', text: decision.options[winner - 1] || `Option ${winner}`, tone: 'passes' };
    }
    if (decision.irv?.tied) {
      return { chip: 'Tied', text: 'No winner under ranked-choice', tone: 'tied' };
    }
    return { chip: 'Ranked choice', text: 'See ballot above', tone: 'tied' };
  }
  const tally = decision.tally || {};
  if (decision.vote_kind === 'plurality' || Array.isArray(decision.options)) {
    if (tally.winner > 0 && Array.isArray(decision.options)) {
      return {
        chip: 'Winner',
        text: decision.options[tally.winner - 1] || `Option ${tally.winner}`,
        tone: 'passes',
      };
    }
    if (Array.isArray(tally.tied_for_first) && tally.tied_for_first.length > 0) {
      return { chip: 'Tied', text: 'No clear plurality winner', tone: 'tied' };
    }
  }
  if (tally.passes) return { chip: 'Passes', text: decision.motion || 'Motion carried', tone: 'passes' };
  if (tally.majority === 'tie') return { chip: 'Tied', text: decision.motion || 'Vote tied', tone: 'tied' };
  if (tally.passes === false) return { chip: 'Fails', text: decision.motion || 'Motion failed', tone: 'fails' };
  return { chip: 'Vote result', text: decision.motion || 'See ballot above', tone: 'tied' };
}
