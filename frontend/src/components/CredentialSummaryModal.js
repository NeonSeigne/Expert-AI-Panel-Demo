import React from 'react';

/**
 * Read-only modal that surfaces the orchestrator-generated Credential
 * Summary - the per-participant assessment of expertise, debating
 * style, credibility on this question, and biases to watch.
 *
 * Built once after Phase 1 (initial opinions) and refreshed once after
 * Phase 2 (critique). The modal pulls a fresh snapshot via GET
 * /api/chat/{id}/credentials each time it's opened, so the user sees
 * the latest version regardless of when they peek.
 *
 * Layout mirrors ChatTableView (overlay + card + close button) for
 * consistency with the existing transparency surfaces.
 */
export default function CredentialSummaryModal({
  isOpen,
  data,
  onClose,
  onRefresh,
}) {
  if (!isOpen) return null;

  const credentials = (data && data.credentials) || [];
  const question = data?.question || '';

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Credential Summary</h2>
            <div className="ccai-credentials-subtitle">
              The orchestrator's neutral assessment of each participant.
              Built after Phase 1 and refreshed once after Phase 2 critique.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          {onRefresh && (
            <button
              className="btn-sm btn-outline"
              onClick={onRefresh}
              title="Re-fetch from the server"
            >
              Refresh
            </button>
          )}
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {question && (
          <div className="ccai-credentials-question">
            <strong>Question:</strong>
            <div>{question}</div>
          </div>
        )}

        <div className="ccai-credentials-body">
          {credentials.length === 0 ? (
            <div className="ccai-credentials-empty">
              No Credential Summary has been generated yet. The
              orchestrator builds it after Phase 1 (initial opinions).
            </div>
          ) : (
            credentials.map((c) => (
              <CredentialCard key={c.participant_id} cred={c} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialCard({ cred }) {
  const score = toScore(cred.credibility_for_question);
  return (
    <div className="ccai-credential-card">
      <div className="ccai-credential-card-head">
        <div className="ccai-credential-name">
          {cred.name || cred.participant_id}
        </div>
        {score !== null && (
          <div className="ccai-credibility-wrap" title={`Credibility ${score.toFixed(2)} of 1.0`}>
            <span className="ccai-credibility-label">Credibility</span>
            <div className="ccai-credibility-bar">
              <div
                className="ccai-credibility-fill"
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </div>
            <span className="ccai-credibility-num">{score.toFixed(2)}</span>
          </div>
        )}
      </div>
      <FieldRow label="Expertise" value={cred.expertise} />
      <FieldRow label="Style" value={cred.personality} />
      <FieldRow label="Bias to watch" value={cred.bias_to_watch} />
    </div>
  );
}

function FieldRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="ccai-credential-row">
      <div className="ccai-credential-row-label">{label}</div>
      <div className="ccai-credential-row-value">{value}</div>
    </div>
  );
}

function toScore(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}
