import React from 'react';

const COPY = {
  one_left: {
    title: 'One chat remaining today',
    body: (
      <>
        You have one chat left for today. Contact us at{' '}
        <a href="mailto:info@neon.ai">info@neon.ai</a> if you would like to do
        more with CCAI.
      </>
    ),
  },
  exhausted: {
    title: 'Daily chat limit reached',
    body: (
      <>
        You have used all of your chats for today. Contact us at{' '}
        <a href="mailto:info@neon.ai">info@neon.ai</a> if you would like to do
        more with CCAI.
      </>
    ),
  },
};

/**
 * Modal notice for anonymous / rate-limited users at 1 chat left or
 * when they try to start after the daily cap is exhausted.
 */
export default function RateLimitNotice({ kind, onClose }) {
  if (!kind || !COPY[kind]) return null;
  const { title, body } = COPY[kind];

  return (
    <div
      className="ccai-credentials-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ccai-rate-limit-title"
      onClick={onClose}
    >
      <div
        className="ccai-credentials-card ccai-rate-limit-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ccai-credentials-header">
          <div>
            <h2 id="ccai-rate-limit-title">{title}</h2>
          </div>
          <div className="ccai-tab-spacer" />
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="ccai-rate-limit-body">{body}</div>
        <div className="ccai-rate-limit-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
