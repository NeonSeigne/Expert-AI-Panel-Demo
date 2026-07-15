import React from 'react';
import MdDialog from './md/MdDialog';
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
 * Phase-by-phase summary of the conversation rendered as a table.
 * Question on top, final group opinion under it, one row per
 * participant with first / contribution / revised / final columns,
 * plus credibility and ops reliability.
 *
 * Driven by the GET /api/chat/{id}/table endpoint - so this component
 * just renders the JSON response.
 */
export default function ChatTableView({ isOpen, data, onClose, onExportCsv }) {
  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="fullscreen-compact"
      headline="Conversation Summary Table"
      actions={(
        <>
          <md-outlined-button type="button" onClick={onExportCsv}>
            Export CSV
          </md-outlined-button>
          <md-filled-button type="button" onClick={onClose}>
            Close
          </md-filled-button>
        </>
      )}
    >
      {data ? (
        <div className="ccai-table-body">
          <div className="ccai-table-question">
            <strong>Question:</strong>
            <div>{data.question}</div>
          </div>
          <div className="ccai-table-final">
            <strong>Final group opinion:</strong>
            <div>
              {data.final_report ? data.final_report : (
                <em>No final report yet.</em>
              )}
            </div>
          </div>
          <div className="ccai-table-scroll">
            <table className="ccai-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Credibility</th>
                  <th>Failures</th>
                  <th>Status</th>
                  <th>First opinion</th>
                  <th>Conversation contribution</th>
                  <th>Revised opinion</th>
                  <th>Final opinion</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map(row => {
                  const score = toScore(row.credibility_for_question);
                  const failures = Number(row.consecutive_failures) || 0;
                  return (
                    <tr key={row.participant_id}>
                      <td className="ccai-table-name">
                        <div>{row.name}</div>
                        <small>{row.model_display}</small>
                      </td>
                      <td className="ccai-table-reliability">
                        <div
                          className="ccai-credibility-wrap"
                          title={score == null ? 'Credibility unavailable' : `Credibility ${score.toFixed(2)} of 1.0`}
                        >
                          <div className="ccai-credibility-bar">
                            <div
                              className="ccai-credibility-fill"
                              style={{ width: `${score == null ? 0 : score * 100}%` }}
                            />
                          </div>
                          <span className="ccai-credibility-num">
                            {score == null ? '—' : score.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td>{failures}</td>
                      <td>
                        <span className={`ccai-reliability-badge ${row.auto_disabled ? 'is-auto-disabled' : row.enabled === false ? 'is-off' : 'is-active'}`}>
                          {statusLabel(row)}
                        </span>
                      </td>
                      <td>{row.first_opinion}</td>
                      <td>{row.contribution_summary || <em>(no summary)</em>}</td>
                      <td>{row.revised_opinion}</td>
                      <td>{row.final_opinion}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="ccai-credentials-empty">Loading table...</div>
      )}
    </MdDialog>
  );
}
