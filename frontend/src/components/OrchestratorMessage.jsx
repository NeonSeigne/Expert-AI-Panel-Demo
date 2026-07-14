import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Gavel,
  ListOrdered,
  Radio,
  ScrollText,
  Sparkles,
  Vote,
} from 'lucide-react';

const REPORT_KINDS = new Set([
  'majority_report',
  'no_consensus_report',
  'vote_result',
  'ranked_choice_result',
]);

function iconForKind(kind, message) {
  switch (kind) {
    case 'majority_report':
    case 'no_consensus_report':
      return ScrollText;
    case 'vote_result':
      return Vote;
    case 'ranked_choice_result':
      return ListOrdered;
    case 'factor':
      return AlertTriangle;
    case 'ballot_options':
      return Vote;
    case 'motion':
    case 'rr_opening':
    case 'rr_call_the_question':
      return Gavel;
    case 'status':
      return Radio;
    default:
      if (message?.flavor === 'roberts_rules') return Gavel;
      return Sparkles;
  }
}

function labelSuffixForKind(kind, message) {
  switch (kind) {
    case 'majority_report': return ' · Majority Report';
    case 'no_consensus_report': return ' · No-Consensus Report';
    case 'factor': return ' · New Consideration';
    case 'motion': return ' · Motion on the Floor';
    case 'ballot_options': return ' · Ballot';
    case 'rr_opening': return ' · Chair';
    case 'rr_call_the_question': return ' · Chair Calls the Question';
    case 'vote_result':
      if (message?.flavor === 'roberts_rules') return ' · Vote Result (RR)';
      if (message?.vote_kind === 'yesno') return ' · Vote Result (Aye/Nay)';
      return ' · Vote Result';
    case 'ranked_choice_result': return ' · Ranked-Choice Result';
    default: return '';
  }
}

/** MD3 card with large left icon (modal-title style) + content column. */
export default function OrchestratorMessage({ message }) {
  const isReport = REPORT_KINDS.has(message.kind);
  const Icon = iconForKind(message.kind, message);
  const className = [
    'ccai-orchestrator-msg',
    'md-chat-orch',
    isReport ? 'ccai-orchestrator-msg-report md-chat-orch--report' : 'ccai-orchestrator-msg-enter md-chat-orch--status',
  ].join(' ');

  return (
    <div className={className}>
      <div className="ccai-orchestrator-msg-icon-wrap" aria-hidden>
        <Icon size={16} strokeWidth={2} className="ccai-orchestrator-msg-icon" />
      </div>
      <div className="ccai-orchestrator-msg-content">
        <div className="ccai-orchestrator-msg-label md-chat-orch-label">
          <span className="ccai-orchestrator-msg-label-text">
            Orchestrator{labelSuffixForKind(message.kind, message)}
          </span>
        </div>
        <div className="ccai-orchestrator-msg-body md-chat-orch-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.text || ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
