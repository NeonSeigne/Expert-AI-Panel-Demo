import React from 'react';
import '../neon/neon-material.register.js';

function toScore(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function statusLabel(row) {
  if (row.auto_disabled) return 'Auto-disabled';
  if (row.enabled === false) return 'Off';
  return 'Active';
}

/**
 * End-of-chat reliability strip using MD3 surface + linear progress + chips.
 */
export default function PersonaReliabilitySummary({ rows }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="ccai-reliability-summary md-chat-reliability" aria-label="Persona reliability">
      <div className="ccai-reliability-summary-title">Persona reliability</div>
      <ul className="ccai-reliability-summary-list">
        {rows.map((row) => {
          const score = toScore(row.credibility_for_question);
          const failures = Number(row.consecutive_failures) || 0;
          const chipClass = row.auto_disabled
            ? 'is-auto-disabled'
            : row.enabled === false
              ? 'is-off'
              : 'is-active';
          return (
            <li key={row.participant_id || row.name} className="ccai-reliability-summary-row">
              <div className="ccai-reliability-summary-name">
                <span>{row.name}</span>
                <small>{row.model_display}</small>
              </div>
              <div
                className="ccai-reliability-credibility"
                title={score == null ? 'Credibility unavailable' : `Credibility ${score.toFixed(2)} of 1.0`}
              >
                <span className="ccai-credibility-label">Credibility</span>
                <md-linear-progress
                  className="ccai-reliability-progress"
                  value={score == null ? 0 : score}
                  max={1}
                  aria-label={`Credibility ${score == null ? 'unavailable' : score.toFixed(2)}`}
                />
                <span className="ccai-credibility-num">
                  {score == null ? '—' : score.toFixed(2)}
                </span>
              </div>
              <div className="ccai-reliability-meta">
                <span className="ccai-reliability-failures">
                  {failures} failure{failures === 1 ? '' : 's'}
                </span>
                <md-assist-chip className={`ccai-reliability-chip ${chipClass}`} label={statusLabel(row)}>
                  {statusLabel(row)}
                </md-assist-chip>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
