import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Distinct rendering for orchestrator messages. Centered, italic, and
 * a different color than participant bubbles so users always know who's
 * speaking. Used for status updates, follow-up announcements, factor
 * surfacing, and the final majority/no-consensus reports.
 */
// Orchestrator message `kind` values that should get the "report"
// visual treatment (border, larger text). Includes the originals
// from the Consensus decision path plus the new ones emitted by the
// majority-rules, ranked-choice, and Robert's Rules vote plugins.
const REPORT_KINDS = new Set([
  'majority_report',
  'no_consensus_report',
  'vote_result',
  'ranked_choice_result',
]);

function labelSuffixForKind(kind, message) {
  switch (kind) {
    case 'majority_report': return ' - Majority Report';
    case 'no_consensus_report': return ' - No-Consensus Report';
    case 'factor': return ' - New Consideration';
    case 'motion': return ' - Motion on the Floor';
    case 'ballot_options': return ' - Ballot';
    case 'rr_opening': return ' - Chair';
    case 'rr_call_the_question': return ' - Chair Calls the Question';
    case 'vote_result':
      if (message?.flavor === 'roberts_rules') return ' - Vote Result (RR)';
      if (message?.vote_kind === 'yesno') return ' - Vote Result (Aye/Nay)';
      return ' - Vote Result';
    case 'ranked_choice_result': return ' - Ranked-Choice Result';
    default: return '';
  }
}

export default function OrchestratorMessage({ message }) {
  const isReport = REPORT_KINDS.has(message.kind);
  const className = (
    'ccai-orchestrator-msg' +
    (isReport ? ' ccai-orchestrator-msg-report' : '')
  );
  return (
    <div className={className}>
      <div className="ccai-orchestrator-msg-label">
        Orchestrator{labelSuffixForKind(message.kind, message)}
      </div>
      <div className="ccai-orchestrator-msg-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.text || ''}
        </ReactMarkdown>
      </div>
    </div>
  );
}
