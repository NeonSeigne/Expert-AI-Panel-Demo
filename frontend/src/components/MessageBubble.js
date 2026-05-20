import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PALETTE = [
  { color: '#6366F1', bg: '#EEF2FF' },   // indigo
  { color: '#059669', bg: '#ECFDF5' },   // emerald
  { color: '#D97706', bg: '#FFFBEB' },   // amber
  { color: '#DC2626', bg: '#FEE2E2' },   // red
  { color: '#0891B2', bg: '#ECFEFF' },   // cyan
  { color: '#7C3AED', bg: '#F5F3FF' },   // violet
  { color: '#0D9488', bg: '#F0FDFA' },   // teal
  { color: '#DB2777', bg: '#FDF2F8' },   // pink
  { color: '#65A30D', bg: '#F7FEE7' },   // lime
];

function colorForIdx(idx) {
  return PALETTE[idx % PALETTE.length];
}

/**
 * Generic participant bubble. The CCAI demo can have up to 9 active
 * participants, so we colorize by their index in the active roster
 * rather than the original A/B scheme.
 */
export default function MessageBubble({ message, idx, showResponseTime }) {
  const tone = colorForIdx(idx);
  const initial = (message.speaker_name || '?').charAt(0).toUpperCase();
  const elapsed = message.elapsed_seconds;
  return (
    <div className="message-row ccai-message-row">
      <div
        className="avatar"
        style={{ background: tone.color, borderRadius: '50%' }}
      >
        {initial}
      </div>
      <div
        className="message-bubble ccai-bubble"
        style={{
          background: tone.bg,
          border: `1px solid ${tone.color}33`,
        }}
      >
        <div className="message-speaker" style={{ color: tone.color }}>
          {message.speaker_name}
          {message.model_display && (
            <span className="ccai-bubble-model"> &middot; {message.model_display}</span>
          )}
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.text}
        </ReactMarkdown>
        {showResponseTime && elapsed > 0 && (
          <div className="message-elapsed">{elapsed.toFixed(1)}s</div>
        )}
      </div>
    </div>
  );
}
