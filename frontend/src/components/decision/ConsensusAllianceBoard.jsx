import React, { useState } from 'react';

function clip(text, max = 160) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function MemberStance({ row }) {
  const [open, setOpen] = useState(false);
  const full = (row?.revised_opinion || row?.final_opinion || '').trim();
  const preview = clip(full);
  const needsExpand = full.length > 160;

  if (!full) {
    return <p className="ccai-decision-member-stance is-empty">No stance text</p>;
  }

  return (
    <div className="ccai-decision-member-stance">
      <p>{open ? full : preview}</p>
      {needsExpand ? (
        <button
          type="button"
          className="ccai-decision-reason-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Alliance / stance clusters for consensus (majority or no-consensus).
 */
export default function ConsensusAllianceBoard({ decision, rows }) {
  const groups = Array.isArray(decision?.alliance_groups)
    ? decision.alliance_groups
    : [];

  const rowById = {};
  (rows || []).forEach((r) => {
    if (r?.participant_id) rowById[r.participant_id] = r;
  });

  const majorityNames = new Set();
  (decision?.majority_members || []).forEach((n) => {
    if (n) majorityNames.add(String(n).toLowerCase());
  });

  const majorityStance = String(decision?.majority_stance || '').trim().toLowerCase();
  const isMajority = decision?.kind === 'majority';

  if (groups.length === 0) {
    return (
      <p className="ccai-decision-empty">No alliance groups were recorded.</p>
    );
  }

  return (
    <div className="ccai-decision-consensus">
      {isMajority && decision.majority_stance ? (
        <div className="ccai-decision-verdict-row">
          <md-assist-chip className="ccai-decision-verdict-chip is-passes" label="Majority">
            Majority
          </md-assist-chip>
          <span className="ccai-decision-winner-text">{decision.majority_stance}</span>
        </div>
      ) : null}
      {decision?.kind === 'no_consensus' ? (
        <div className="ccai-decision-verdict-row">
          <md-assist-chip className="ccai-decision-verdict-chip is-fails" label="No consensus">
            No consensus
          </md-assist-chip>
        </div>
      ) : null}

      <ul className="ccai-decision-alliance-list">
        {groups.map((g, idx) => {
          const stance = String(g.stance || '').trim() || `Alliance ${idx + 1}`;
          const members = Array.isArray(g.members) ? g.members : [];
          const isWinnerGroup = isMajority && (
            (majorityStance && stance.toLowerCase() === majorityStance)
            || members.some((pid) => {
              const row = rowById[pid];
              return row && majorityNames.has(String(row.name || '').toLowerCase());
            })
          );

          return (
            <li
              key={`alliance-${idx}`}
              className={[
                'ccai-decision-alliance',
                isWinnerGroup ? 'is-majority' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="ccai-decision-alliance-header">
                <span className="ccai-decision-alliance-stance">{stance}</span>
                {isWinnerGroup ? (
                  <md-assist-chip className="ccai-decision-verdict-chip is-passes" label="Majority group">
                    Majority group
                  </md-assist-chip>
                ) : null}
                <span className="ccai-decision-alliance-count">
                  {members.length} member{members.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="ccai-decision-alliance-members">
                {members.map((pid) => {
                  const row = rowById[pid];
                  const name = row?.name || pid;
                  return (
                    <li key={pid} className="ccai-decision-alliance-member">
                      <div className="ccai-decision-alliance-member-name">
                        <span>{name}</span>
                        {row?.model_display ? (
                          <small>{row.model_display}</small>
                        ) : null}
                      </div>
                      <MemberStance row={row} />
                    </li>
                  );
                })}
                {members.length === 0 ? (
                  <li className="ccai-decision-empty">No members</li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
