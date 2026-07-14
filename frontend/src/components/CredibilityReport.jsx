import React from 'react';
import { AVATAR_PALETTE } from '../constants/brandColors';
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

function clip(text, max = 140) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/**
 * End-of-chat credibility ranking with comparative bars + credentials CTA.
 */
export default function CredibilityReport({
  rows,
  speakerIdxFor = {},
  onOpenFullReport,
  compact = false,
}) {
  if (!rows || rows.length === 0) return null;

  const ranked = [...rows].sort((a, b) => {
    const sa = toScore(a.credibility_for_question);
    const sb = toScore(b.credibility_for_question);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  });

  return (
    <section
      className={[
        'ccai-credibility-report',
        compact ? 'is-compact' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Credibility report"
    >
      <div className="ccai-wrap-up-section-head">
        <h3 className="ccai-wrap-up-section-title ccai-bento-kicker">Credibility</h3>
        {onOpenFullReport ? (
          <button
            type="button"
            className="ccai-wrap-up-link-btn"
            onClick={onOpenFullReport}
          >
            Full report
          </button>
        ) : null}
      </div>

      <ol className="ccai-credibility-report-list">
        {ranked.map((row, rank) => {
          const score = toScore(row.credibility_for_question);
          const failures = Number(row.consecutive_failures) || 0;
          const chipClass = row.auto_disabled
            ? 'is-auto-disabled'
            : row.enabled === false
              ? 'is-off'
              : 'is-active';
          const idx = speakerIdxFor[row.participant_id] ?? rank;
          const barColor = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
          const peek = compact ? '' : clip(row.contribution_summary);
          return (
            <li
              key={row.participant_id || row.name}
              className="ccai-credibility-report-row"
            >
              <div className="ccai-credibility-report-rank" aria-hidden>
                {rank + 1}
              </div>
              <div className="ccai-credibility-report-body">
                <div className="ccai-credibility-report-topline">
                  <div className="ccai-credibility-report-name">
                    <span>{row.name}</span>
                    {!compact ? <small>{row.model_display}</small> : null}
                  </div>
                  <div className="ccai-credibility-report-meta">
                    {!compact ? (
                      <span className="ccai-reliability-failures">
                        {failures} failure{failures === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    <md-assist-chip
                      className={`ccai-reliability-chip ${chipClass}`}
                      label={statusLabel(row)}
                    >
                      {statusLabel(row)}
                    </md-assist-chip>
                  </div>
                </div>
                <div
                  className="ccai-credibility-report-bar-wrap"
                  title={score == null ? 'Credibility unavailable' : `${score.toFixed(2)} of 1.0`}
                >
                  <div className="ccai-wrap-up-bar" aria-hidden>
                    <div
                      className="ccai-wrap-up-bar-fill"
                      style={{
                        width: score == null ? '0%' : `${Math.round(score * 100)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <span className="ccai-credibility-num">
                    {score == null ? '—' : score.toFixed(2)}
                  </span>
                </div>
                {peek ? (
                  <p className="ccai-credibility-report-peek">{peek}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
