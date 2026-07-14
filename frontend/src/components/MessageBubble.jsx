import React, { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import NeonChatBubble from '../neon/NeonChatBubble';
import { HUMAN_TONE, PARTICIPANT_PALETTE } from '../constants/brandColors';

function colorForIdx(idx) {
  return PARTICIPANT_PALETTE[idx % PARTICIPANT_PALETTE.length];
}

export default function MessageBubble({
  message,
  idx,
  messageIdx,
  prevMessage,
  participantNameById,
  showResponseTime,
  expandToggle = null,
  contentClamped = false,
}) {
  const isHuman = message.kind === 'human'
    || (message.model_display === 'Human participant');
  const tone = isHuman ? HUMAN_TONE : colorForIdx(idx);
  const initial = (message.speaker_name || '?').charAt(0).toUpperCase();
  const elapsed = message.elapsed_seconds;

  const addresseeId = message.addressed_to || null;
  const addresseeName = addresseeId
    ? (participantNameById?.[addresseeId] || addresseeId)
    : null;

  const replyingToNames = (message.replying_to || [])
    .map((pid) => participantNameById?.[pid])
    .filter(Boolean);

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

  const rowClassName = [
    'ccai-message-row',
    isDirectReply ? 'ccai-message-row-reply' : '',
    isHuman ? 'ccai-message-row-human' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const headerExtra = replyingToNames.length > 0 ? (
    <div
      className="ccai-replying-to-pill"
      style={{
        borderColor: `${tone.color}66`,
        color: tone.color,
      }}
    >
      Replying to: {replyingToNames.join(', ')}
    </div>
  ) : null;

  const nameExtra = (
    <>
      {expandToggle}
      {addresseeName ? (
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
      ) : null}
    </>
  );

  const footerExtra = showResponseTime && elapsed > 0 ? (
    <div className="ccai-message-elapsed">{elapsed.toFixed(1)}s</div>
  ) : null;

  return (
    <NeonChatBubble
      side={isHuman ? 'User' : 'Agent'}
      senderName={message.speaker_name}
      content={message.text || ''}
      loading={Boolean(message.streaming && !message.text)}
      bubbleColor={tone.bg}
      avatarKind={isHuman ? 'user' : 'initial'}
      avatarLabel={initial}
      avatarColor={tone.color}
      accentColor={tone.color}
      headerExtra={headerExtra}
      nameExtra={nameExtra}
      footerExtra={footerExtra}
      rowClassName={rowClassName}
      contentClassName={contentClamped ? 'ccai-bubble-content-clamped' : ''}
      rowProps={{
        'data-msg-idx': messageIdx,
        'data-speaker-id': message.speaker_id || '',
      }}
    />
  );
}
