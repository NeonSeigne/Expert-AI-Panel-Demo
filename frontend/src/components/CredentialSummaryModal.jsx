import React, { useMemo, useState, useEffect } from 'react';
import { Download, Edit2, Check, X, User } from 'lucide-react';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

/**
 * Credential Summary modal — orchestrator assessment of each participant.
 */
export default function CredentialSummaryModal({
  isOpen,
  data,
  onClose,
  onRefresh,
  humanParticipantId,
  onEditHumanCredential,
}) {
  const filename = useMemo(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      'ccai-credentials-'
      + `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
      + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      + '.txt'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const credentials = (data && data.credentials) || [];
  const question = data?.question || '';

  const handleDownload = () => {
    if (!credentials.length) return;
    const txt = renderCredentialsAsText(question, credentials);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="large"
      headline="Credential Summary"
      actions={(
        <>
          {onRefresh ? (
            <md-text-button type="button" onClick={onRefresh}>
              Refresh
            </md-text-button>
          ) : null}
          <md-outlined-button
            type="button"
            onClick={handleDownload}
            disabled={credentials.length === 0 || undefined}
          >
            <Download size={16} slot="icon" aria-hidden />
            Download as .txt
          </md-outlined-button>
          <md-filled-button type="button" onClick={onClose}>
            Close
          </md-filled-button>
        </>
      )}
    >
      <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
        The orchestrator&apos;s neutral assessment of each participant.
        Built during Phase 1; updated only if a participant&apos;s model changes.
      </p>
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
          credentials.map((c) => {
            const isHuman = !!humanParticipantId
              && c.participant_id === humanParticipantId;
            return (
              <CredentialCard
                key={c.participant_id}
                cred={c}
                isHuman={isHuman}
                onEdit={isHuman ? onEditHumanCredential : null}
              />
            );
          })
        )}
      </div>
    </MdDialog>
  );
}

function CredentialCard({ cred, isHuman, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    name: cred.name || '',
    expertise: cred.expertise || '',
    personality: cred.personality || '',
    credibility_for_question:
      cred.credibility_for_question !== undefined
        ? cred.credibility_for_question
        : 0.5,
    bias_to_watch: cred.bias_to_watch || '',
  }));

  // Reset the draft whenever the underlying credential payload
  // changes (e.g. a Phase-3 refresh from the SSE stream).
  useEffect(() => {
    setDraft({
      name: cred.name || '',
      expertise: cred.expertise || '',
      personality: cred.personality || '',
      credibility_for_question:
        cred.credibility_for_question !== undefined
          ? cred.credibility_for_question
          : 0.5,
      bias_to_watch: cred.bias_to_watch || '',
    });
  }, [cred]);

  const score = toScore(cred.credibility_for_question);

  if (isHuman && editing) {
    return (
      <div className="ccai-credential-card ccai-credential-card-human ccai-credential-card-editing">
        <div className="ccai-credential-card-head">
          <div className="ccai-credential-name">
            <User size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            <input
              className="ccai-credential-edit-name"
              type="text"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
            <span className="ccai-credential-human-tag">Human</span>
          </div>
        </div>
        <EditableRow
          label="Expertise"
          value={draft.expertise}
          onChange={v => setDraft(d => ({ ...d, expertise: v }))}
        />
        <EditableRow
          label="Style"
          value={draft.personality}
          onChange={v => setDraft(d => ({ ...d, personality: v }))}
        />
        <EditableScoreRow
          label="Credibility (0-1)"
          value={draft.credibility_for_question}
          onChange={v => setDraft(d => ({ ...d, credibility_for_question: v }))}
        />
        <EditableRow
          label="Bias to watch"
          value={draft.bias_to_watch}
          onChange={v => setDraft(d => ({ ...d, bias_to_watch: v }))}
        />
        <div className="ccai-credential-edit-actions">
          <md-text-button
            type="button"
            onClick={() => setEditing(false)}
          >
            <X size={12} slot="icon" aria-hidden />
            Cancel
          </md-text-button>
          <md-filled-button
            type="button"
            onClick={async () => {
              await onEdit?.(draft);
              setEditing(false);
            }}
          >
            <Check size={12} slot="icon" aria-hidden />
            Save
          </md-filled-button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        'ccai-credential-card'
        + (isHuman ? ' ccai-credential-card-human' : '')
      }
    >
      <div className="ccai-credential-card-head">
        <div className="ccai-credential-name">
          {isHuman && (
            <User size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          )}
          {cred.name || cred.participant_id}
          {isHuman && (
            <span className="ccai-credential-human-tag">Human</span>
          )}
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
        {isHuman && onEdit && (
          <md-outlined-button
            type="button"
            className="ccai-credential-edit-btn"
            onClick={() => setEditing(true)}
            title="Edit your credential summary"
          >
            <Edit2 size={12} slot="icon" aria-hidden />
            Edit
          </md-outlined-button>
        )}
      </div>
      <FieldRow label="Expertise" value={cred.expertise} />
      <FieldRow label="Style" value={cred.personality} />
      <FieldRow label="Bias to watch" value={cred.bias_to_watch} />
    </div>
  );
}

function EditableRow({ label, value, onChange }) {
  return (
    <div className="ccai-credential-row ccai-credential-row-edit">
      <div className="ccai-credential-row-label">{label}</div>
      <textarea
        className="ccai-credential-row-input"
        rows={2}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function EditableScoreRow({ label, value, onChange }) {
  return (
    <div className="ccai-credential-row ccai-credential-row-edit">
      <div className="ccai-credential-row-label">{label}</div>
      <input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={value}
        className="ccai-credential-row-input ccai-credential-row-input-num"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.max(0, Math.min(1, v)));
        }}
      />
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

/**
 * Flat human-readable .txt dump used by the Download button. Same
 * banner/separator style as PromptCatalogModal.renderCatalogAsText so
 * the two transparency exports look like a matched set.
 */
function renderCredentialsAsText(question, credentials) {
  const now = new Date().toISOString();
  const lines = [];
  const banner = '═'.repeat(64);
  lines.push(banner);
  lines.push('Co-Panel — Credential Summary');
  lines.push(`Generated: ${now}`);
  lines.push(banner);
  lines.push('');

  if (question) {
    lines.push('Question:');
    for (const ln of String(question).split('\n')) {
      lines.push('    ' + ln);
    }
    lines.push('');
  }

  const sep = '─'.repeat(12);
  lines.push(`${sep} Participants ${sep}`);
  lines.push('');

  for (const cred of credentials) {
    const score = toScore(cred.credibility_for_question);
    const name = cred.name || cred.participant_id || '(unknown)';
    lines.push(`## ${name}`);
    if (score !== null) {
      lines.push(`Credibility: ${score.toFixed(2)} of 1.00`);
    }
    if (cred.expertise) lines.push(`Expertise: ${cred.expertise}`);
    if (cred.personality) lines.push(`Style: ${cred.personality}`);
    if (cred.bias_to_watch) lines.push(`Bias to watch: ${cred.bias_to_watch}`);
    lines.push('');
  }

  return lines.join('\n');
}
