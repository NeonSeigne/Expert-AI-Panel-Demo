import { isVoteDecision } from './voteUi';

function toScore(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function voterLabel(ballot) {
  const name = String(ballot?.voter_name || '').trim();
  if (name) return name;
  const id = String(ballot?.voter_id || '').trim();
  return id || 'Voter';
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
    const buckets = options.map(() => []);
    for (const b of ballots) {
      const ranking = Array.isArray(b.ranking) ? b.ranking : [];
      const first = Number(ranking[0]);
      if (first >= 1 && first <= options.length) buckets[first - 1].push(b);
    }
    const total = Math.max(1, buckets.reduce((a, list) => a + list.length, 0));
    return options.map((label, i) => ({
      label,
      count: buckets[i].length,
      share: buckets[i].length / total,
      voters: buckets[i].map(voterLabel),
    }));
  }

  if (decision.vote_kind === 'yesno' || (decision.ballots || []).some((b) => b.vote != null)) {
    const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
    const buckets = { aye: [], nay: [], abstain: [] };
    for (const b of ballots) {
      const vote = String(b.vote || '').toLowerCase();
      if (vote === 'aye') buckets.aye.push(b);
      else if (vote === 'nay') buckets.nay.push(b);
      else buckets.abstain.push(b);
    }
    const tally = decision.tally || {};
    const aye = Number(tally.aye) || buckets.aye.length;
    const nay = Number(tally.nay) || buckets.nay.length;
    const abstain = Number(tally.abstain) || buckets.abstain.length;
    const total = Math.max(1, aye + nay + abstain);
    return [
      { label: 'Aye', count: aye, share: aye / total, voters: buckets.aye.map(voterLabel) },
      { label: 'Nay', count: nay, share: nay / total, voters: buckets.nay.map(voterLabel) },
      { label: 'Abstain', count: abstain, share: abstain / total, voters: buckets.abstain.map(voterLabel) },
    ];
  }

  if (decision.vote_kind === 'plurality' || Array.isArray(decision.options)) {
    const options = Array.isArray(decision.options) ? decision.options : [];
    const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
    const counts = Array.isArray(decision.tally?.counts) ? decision.tally.counts : [];
    const total = Math.max(1, counts.reduce((a, b) => a + (Number(b) || 0), 0)
      || ballots.filter((b) => Number(b.choice) > 0).length);
    return options.map((label, i) => {
      const choiceNum = i + 1;
      const voters = ballots.filter((b) => Number(b.choice) === choiceNum);
      const count = Number(counts[i]) || voters.length;
      return {
        label,
        count,
        share: count / total,
        voters: voters.map(voterLabel),
      };
    });
  }

  return null;
}

function buildAllianceBars(decision) {
  if (!decision) return null;
  if (decision.kind !== 'majority' && decision.kind !== 'no_consensus') return null;
  const groups = Array.isArray(decision.alliance_groups) ? decision.alliance_groups : [];
  if (groups.length === 0) return null;
  const sizes = groups.map((g) => {
    const members = Array.isArray(g.members) ? g.members : [];
    const voters = members.map((m) => {
      if (typeof m === 'string') return m.trim() || 'Member';
      return String(m?.name || m?.voter_name || '').trim() || 'Member';
    });
    return {
      label: String(g.stance || 'Alliance').trim() || 'Alliance',
      count: voters.length,
      voters,
    };
  });
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
