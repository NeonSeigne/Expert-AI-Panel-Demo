import React, { useMemo, useState } from 'react';
import {
  Clock,
  Download,
  Flag,
  MessagesSquare,
  Vote,
} from 'lucide-react';
import ExportMenu from './ExportMenu';
import CredibilityReport from './CredibilityReport';
import DecisionSummaryPanel from './decision/DecisionSummaryPanel';
import {
  computeWrapUpStats,
  voteVerdictLabel,
} from '../utils/chatWrapUpStats';
import { isVoteDecision } from '../utils/voteUi';
import '../neon/neon-material.register.js';

const REPORT_PREVIEW_LEN = 220;

function clip(text, max) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function resolvePerson(value, participantNameById) {
  const raw = String(value || '').trim();
  if (!raw) return 'Voter';
  return participantNameById?.[raw] || raw;
}

function BentoKicker({ icon: Icon, children }) {
  return (
    <p className="ccai-bento-kicker">
      {Icon ? <Icon size={18} strokeWidth={2.25} className="ccai-bento-kicker-icon" aria-hidden /> : null}
      <span>{children}</span>
    </p>
  );
}

function BentoCell({ className = '', children, label }) {
  return (
    <div className={`ccai-bento-cell ${className}`.trim()} aria-label={label || undefined}>
      {children}
    </div>
  );
}

function ShareBarList({ bars, participantNameById = {} }) {
  if (!bars || bars.length === 0) return null;
  const maxShare = Math.max(0.01, ...bars.map((b) => b.share || 0));
  return (
    <ul className="ccai-wrap-up-bar-list">
      {bars.map((bar) => {
        const voters = (bar.voters || [])
          .map((v) => resolvePerson(v, participantNameById))
          .filter(Boolean);
        return (
          <li key={bar.label} className="ccai-wrap-up-bar-row">
            <div className="ccai-wrap-up-bar-label">
              <span className="ccai-wrap-up-bar-label-text">{bar.label}</span>
              <strong>{bar.count}</strong>
            </div>
            <div className="ccai-wrap-up-bar" aria-hidden>
              <div
                className="ccai-wrap-up-bar-fill"
                style={{ width: `${Math.round(((bar.share || 0) / maxShare) * 100)}%` }}
              />
            </div>
            <p className="ccai-wrap-up-bar-voters">
              {voters.length > 0
                ? voters.join(' · ')
                : 'No votes'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function ResultCell({ decision, rows, voteDecision }) {
  const [expanded, setExpanded] = useState(false);
  const consensus = decision?.kind === 'majority' || decision?.kind === 'no_consensus';
  const vote = isVoteDecision(voteDecision)
    ? voteDecision
    : (isVoteDecision(decision) ? decision : null);
  const verdict = vote ? voteVerdictLabel(vote) : null;
  const reportText = String(decision?.text || vote?.text || '').trim();
  const needsExpand = reportText.length > REPORT_PREVIEW_LEN;
  const shown = expanded || !needsExpand
    ? reportText
    : clip(reportText, REPORT_PREVIEW_LEN);

  return (
    <BentoCell className="ccai-bento-cell--result" label="Session result">
      <BentoKicker icon={Flag}>Result</BentoKicker>

      {consensus ? (
        <DecisionSummaryPanel decision={decision} rows={rows} />
      ) : null}

      {verdict ? (
        <div className="ccai-wrap-up-verdict">
          <div className="ccai-decision-verdict-row">
            <md-assist-chip
              className={`ccai-decision-verdict-chip is-${verdict.tone}`}
              label={verdict.chip}
            >
              {verdict.chip}
            </md-assist-chip>
            <span className="ccai-decision-winner-text">{verdict.text}</span>
          </div>
          <p className="ccai-wrap-up-verdict-hint">Ballot details above</p>
        </div>
      ) : null}

      {!consensus && !verdict && !reportText ? (
        <p className="ccai-wrap-up-empty">No structured decision recorded.</p>
      ) : null}

      {reportText ? (
        <div className="ccai-wrap-up-report-text">
          <p>{shown}</p>
          {needsExpand ? (
            <button
              type="button"
              className="ccai-wrap-up-link-btn"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show full report'}
            </button>
          ) : null}
        </div>
      ) : null}
    </BentoCell>
  );
}

function MetricCell({ value, label, icon, className = '' }) {
  return (
    <BentoCell className={`ccai-bento-cell--metric ${className}`.trim()} label={label}>
      <BentoKicker icon={icon}>{label}</BentoKicker>
      <span className="ccai-bento-metric-value">{value}</span>
    </BentoCell>
  );
}

/**
 * End-of-chat wrap-up as a bento grid summary.
 */
export default function ChatWrapUp({
  messages,
  decision,
  voteDecision,
  rows,
  speakerIdxFor = {},
  participantNameById = {},
  showChatStats = true,
  onOpenCredentials,
}) {
  const stats = useMemo(
    () => computeWrapUpStats({
      messages,
      rows: rows || [],
      decision: isVoteDecision(voteDecision)
        ? voteDecision
        : (decision || voteDecision),
    }),
    [messages, rows, decision, voteDecision],
  );

  const shareBars = stats?.shareBars || stats?.allianceBars || null;
  const shareTitle = stats?.shareBars ? 'Vote share' : 'Alliance sizes';
  const hasShare = Boolean(shareBars && shareBars.length > 0);
  const hasCred = Array.isArray(rows) && rows.length > 0;
  const bentoClass = [
    'ccai-bento',
    showChatStats ? 'has-metrics' : null,
    hasShare ? 'has-share' : null,
    hasCred ? 'has-cred' : null,
  ].filter(Boolean).join(' ');

  return (
    <div className="ccai-wrap-up md-chat-wrap-up" aria-label="End of chat summary">
      <header className="ccai-wrap-up-header">
        <h2 className="ccai-wrap-up-title">Session wrap-up</h2>
        <p className="ccai-wrap-up-subtitle">Outcome, stats, and credibility at a glance</p>
      </header>

      <div className={bentoClass}>
        <ResultCell
          decision={decision}
          rows={rows}
          voteDecision={voteDecision || decision}
        />
        {showChatStats ? (
          <MetricCell
            className="ccai-bento-cell--msg"
            value={stats.messageCount}
            label="Messages"
            icon={MessagesSquare}
          />
        ) : null}
        {showChatStats ? (
          <MetricCell
            className="ccai-bento-cell--time"
            value={`${stats.totalTime}s`}
            label="Gen time"
            icon={Clock}
          />
        ) : null}

        {hasShare ? (
          <BentoCell className="ccai-bento-cell--share" label={shareTitle}>
            <BentoKicker icon={Vote}>{shareTitle}</BentoKicker>
            <ShareBarList
              bars={shareBars}
              participantNameById={participantNameById}
            />
          </BentoCell>
        ) : null}
        {hasCred ? (
          <BentoCell className="ccai-bento-cell--cred" label="Credibility report">
            <CredibilityReport
              rows={rows}
              speakerIdxFor={speakerIdxFor}
              onOpenFullReport={onOpenCredentials}
              compact
            />
          </BentoCell>
        ) : null}

        <BentoCell className="ccai-bento-cell--actions" label="Export">
          <BentoKicker icon={Download}>Export</BentoKicker>
          <ExportMenu
            variant="buttons"
            className="ccai-wrap-up-export"
          />
        </BentoCell>
      </div>
    </div>
  );
}
