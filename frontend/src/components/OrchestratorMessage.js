import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Distinct rendering for orchestrator messages. Centered, italic, and
 * a different color than participant bubbles so users always know who's
 * speaking. Used for status updates, follow-up announcements, factor
 * surfacing, and the final majority/no-consensus reports.
 */
export default function OrchestratorMessage({ message }) {
  const isReport = message.kind === 'majority_report' || message.kind === 'no_consensus_report';
  const className = (
    'ccai-orchestrator-msg' +
    (isReport ? ' ccai-orchestrator-msg-report' : '')
  );
  return (
    <div className={className}>
      <div className="ccai-orchestrator-msg-label">
        Orchestrator{message.kind === 'majority_report' ? ' - Majority Report'
          : message.kind === 'no_consensus_report' ? ' - No-Consensus Report'
          : message.kind === 'factor' ? ' - New Consideration'
          : ''}
      </div>
      <div className="ccai-orchestrator-msg-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.text || ''}
        </ReactMarkdown>
      </div>
    </div>
  );
}
