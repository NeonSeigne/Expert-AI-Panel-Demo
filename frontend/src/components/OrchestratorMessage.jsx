import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Download,
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
  'document',
]);

function filenameFromDocument(text) {
  const heading = (text || '').match(/^#\s+(.+)$/m);
  const raw = heading?.[1]?.trim() || 'final-document';
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'final-document'}.md`;
}

function downloadMarkdown(text, filename) {
  const blob = new Blob([text || ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function iconForKind(kind, message) {
  switch (kind) {
    case 'majority_report':
    case 'no_consensus_report':
    case 'document':
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
    case 'pipeline_brief':
      return Sparkles;
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
    case 'document': return ' · Final Document';
    case 'pipeline_brief': return ' · Ideation Brief';
    default: return '';
  }
}

/** MD3 card with large left icon (modal-title style) + content column. */
export default function OrchestratorMessage({ message }) {
  const isReport = REPORT_KINDS.has(message.kind);
  const isDocument = message.kind === 'document';
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
          {isDocument && (
            <button
              type="button"
              className="ccai-orchestrator-msg-download"
              onClick={() => downloadMarkdown(
                message.text || '',
                filenameFromDocument(message.text),
              )}
              disabled={!message.text?.trim()}
            >
              <Download size={14} strokeWidth={2} aria-hidden />
              Download
            </button>
          )}
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
