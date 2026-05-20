import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight } from 'lucide-react';

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
 *
 * Conversation-tracking enhancements:
 *   - "→ Addressee" arrow chip in the speaker line when this message
 *     is aimed at a specific other participant. The chip is clickable
 *     and scrolls the chat to the addressee's most recent message
 *     before this one (with a brief flash highlight).
 *   - "Replying to: X, Y" pill above the bubble whenever the orchestrator
 *     told this participant they had open threads owed before they spoke.
 *   - Light left-indent + thread line when a message is a direct reply to
 *     the immediately previous bubble - cheap visual threading without
 *     full nesting.
 */
export default function MessageBubble({
  message,
  idx,
  messageIdx,
  prevMessage,
  participantNameById,
  showResponseTime,
}) {
  const tone = colorForIdx(idx);
  const initial = (message.speaker_name || '?').charAt(0).toUpperCase();
  const elapsed = message.elapsed_seconds;

  const addresseeId = message.addressed_to || null;
  const addresseeName = addresseeId
    ? (participantNameById?.[addresseeId] || addresseeId)
    : null;

  const replyingToNames = (message.replying_to || [])
    .map((pid) => participantNameById?.[pid])
    .filter(Boolean);

  // Direct reply to the immediately previous participant message gets
  // a light indent + thread line. Skips orchestrator messages.
  const isDirectReply =
    !!addresseeId &&
    prevMessage &&
    prevMessage.role === 'participant' &&
    prevMessage.speaker_id === addresseeId;

  const onAddresseeClick = useCallback(() => {
    if (!addresseeId) return;
    const all = document.querySelectorAll('[data-msg-idx][data-speaker-id]');
    let candidate = null;
    for (const el of all) {
      const eIdx = parseInt(el.getAttribute('data-msg-idx'), 10);
      if (Number.isNaN(eIdx)) continue;
      if (eIdx >= messageIdx) break;
      if (el.getAttribute('data-speaker-id') === addresseeId) {
        candidate = el;
      }
    }
    if (candidate) {
      candidate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      candidate.classList.remove('ccai-flash-highlight');
      void candidate.offsetWidth;
      candidate.classList.add('ccai-flash-highlight');
      setTimeout(
        () => candidate.classList.remove('ccai-flash-highlight'),
        1500,
      );
    }
  }, [addresseeId, messageIdx]);

  const rowClassName =
    'message-row ccai-message-row' +
    (isDirectReply ? ' ccai-message-row-reply' : '');

  return (
    <div
      className={rowClassName}
      data-msg-idx={messageIdx}
      data-speaker-id={message.speaker_id || ''}
    >
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
        {replyingToNames.length > 0 && (
          <div
            className="ccai-replying-to-pill"
            style={{
              borderColor: `${tone.color}66`,
              color: tone.color,
            }}
          >
            Replying to: {replyingToNames.join(', ')}
          </div>
        )}
        <div className="message-speaker" style={{ color: tone.color }}>
          <span>{message.speaker_name}</span>
          {addresseeName && (
            <span className="ccai-addressee-wrap">
              <ArrowRight
                size={12}
                strokeWidth={2.5}
                className="ccai-addressee-arrow"
              />
              <button
                type="button"
                className="ccai-addressee-link"
                style={{ color: tone.color }}
                onClick={onAddresseeClick}
                title={`Jump to ${addresseeName}'s most recent message`}
              >
                {addresseeName}
              </button>
            </span>
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
