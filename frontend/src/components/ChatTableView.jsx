import React from 'react';

/**
 * Phase-by-phase summary of the conversation rendered as a table.
 * Question on top, final group opinion under it, one row per
 * participant with first / contribution / revised / final columns.
 *
 * Driven by the GET /api/chat/{id}/table endpoint - so this component
 * just renders the JSON response.
 */
export default function ChatTableView({ data, onClose, onExportCsv }) {
  if (!data) return null;
  return (
    <div className="ccai-table-overlay">
      <div className="ccai-table-card">
        <div className="ccai-table-header">
          <h2>Conversation Summary Table</h2>
          <div className="ccai-tab-spacer" />
          <button
            className="btn-sm btn-outline"
            onClick={onExportCsv}
            title="Export this table as CSV"
          >
            Export CSV
          </button>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
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
                  <th>First opinion</th>
                  <th>Conversation contribution</th>
                  <th>Revised opinion</th>
                  <th>Final opinion</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map(row => (
                  <tr key={row.participant_id}>
                    <td className="ccai-table-name">
                      <div>{row.name}</div>
                      <small>{row.model_display}</small>
                    </td>
                    <td>{row.first_opinion}</td>
                    <td>{row.contribution_summary || <em>(no summary)</em>}</td>
                    <td>{row.revised_opinion}</td>
                    <td>{row.final_opinion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
