/**
 * Group chat transcript messages into glanceable round sections by phase.
 */

/** Orchestrator kinds that constitute a final (or vote) report. */
export const REPORT_KINDS = new Set([
  'majority_report',
  'no_consensus_report',
  'vote_result',
  'ranked_choice_result',
]);

const PHASE_LABELS = {
  initial_opinions: 'Initial Opinions',
  status_assessment: 'Status Check',
  finalization: 'Final Opinions',
  consensus: 'Consensus Deliberation',
  closure: 'Closing Report',
  voting: 'Vote',
  failsafe_paused: 'Paused',
  finished: 'Finished',
  rr_opening: "Robert's Rules · Opening",
  rr_initial_remarks: "Robert's Rules · Initial Remarks",
  rr_motion: "Robert's Rules · Motion",
  rr_debate: "Robert's Rules · Debate",
  rr_move_the_question: "Robert's Rules · Call the Question",
};

/**
 * Human-readable label for a conversation phase.
 * Handles critique_round_N dynamically; falls back to prettified raw phase.
 */
export function roundLabelForPhase(phase) {
  if (!phase) return 'Discussion';
  if (PHASE_LABELS[phase]) return PHASE_LABELS[phase];

  const critiqueMatch = /^critique_round_(\d+)$/.exec(phase);
  if (critiqueMatch) return `Critique · Round ${critiqueMatch[1]}`;

  return phase
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Group contiguous same-phase messages into round sections.
 *
 * @returns {Array<{
 *   key: string,
 *   phase: string,
 *   label: string,
 *   messages: object[],
 *   hasReport: boolean,
 *   isStreaming: boolean,
 *   participantCount: number,
 * }>}
 */
export function groupMessagesIntoRounds(messages) {
  const rounds = [];
  if (!messages || messages.length === 0) return rounds;

  let current = null;
  const phaseCounts = {};

  for (const msg of messages) {
    const phase = msg.phase || 'discussion';

    if (!current || current.phase !== phase) {
      phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
      const occurrence = phaseCounts[phase];
      current = {
        key: occurrence === 1 ? phase : `${phase}__${occurrence}`,
        phase,
        label: roundLabelForPhase(phase),
        messages: [],
        hasReport: false,
        isStreaming: false,
        participantCount: 0,
      };
      rounds.push(current);
    }

    current.messages.push(msg);

    if (msg.role === 'participant' || (!msg.role && msg.speaker_id)) {
      current.participantCount += 1;
      if (msg.streaming) current.isStreaming = true;
    }
    if (msg.role === 'orchestrator' && REPORT_KINDS.has(msg.kind)) {
      current.hasReport = true;
    }
  }

  return rounds;
}

/**
 * Ordered speaker reply counts for a round (first-seen order).
 * @returns {Array<{ speaker_id: string, name: string, count: number }>}
 */
export function speakerStatsForRound(round) {
  const byId = new Map();
  const order = [];
  for (const msg of round?.messages || []) {
    const isParticipant = msg.role === 'participant' || (!msg.role && msg.speaker_id);
    if (!isParticipant) continue;
    const id = msg.speaker_id || msg.speaker_name || 'unknown';
    if (!byId.has(id)) {
      byId.set(id, {
        speaker_id: id,
        name: msg.speaker_name || id,
        count: 0,
      });
      order.push(id);
    }
    byId.get(id).count += 1;
  }
  return order.map((id) => byId.get(id));
}
