import React, { useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import MessageBubble from './MessageBubble';
import '../neon/neon-material.register.js';

/**
 * Persona response as an MD3 message surface that expands/collapses.
 * Collapsed: two-line clamp. Expanded: full markdown bubble.
 * forceExpanded keeps the full bubble open with no toggle (unused by live rounds).
 */
export default function CollapsibleResponse({
  message,
  idx,
  messageIdx,
  prevMessage,
  participantNameById,
  showResponseTime,
  expanded,
  onToggle,
  forceExpanded = false,
}) {
  const streaming = Boolean(message.streaming);
  const messageKey = message.message_id || `msg-${messageIdx}`;
  const isExpanded = forceExpanded || expanded;

  const handleToggle = useCallback(() => {
    if (forceExpanded) return;
    onToggle(messageKey);
  }, [forceExpanded, onToggle, messageKey]);

  const handleWrapClick = useCallback((event) => {
    if (forceExpanded || isExpanded) return;
    if (event.target.closest('a, button, md-icon-button')) return;
    handleToggle();
  }, [forceExpanded, isExpanded, handleToggle]);

  const handleWrapKeyDown = useCallback((event) => {
    if (forceExpanded || isExpanded) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  }, [forceExpanded, isExpanded, handleToggle]);

  const expandToggle = forceExpanded ? null : (
    <md-icon-button
      className={`ccai-bubble-expand-toggle${isExpanded ? ' is-expanded' : ''}`}
      aria-label={isExpanded ? 'Collapse response' : 'Expand response'}
      aria-expanded={isExpanded ? 'true' : 'false'}
      onClick={(event) => {
        event.stopPropagation();
        handleToggle();
      }}
    >
      <ChevronRight
        size={18}
        className={`ccai-collapsed-response-chevron${isExpanded ? ' is-expanded' : ''}`}
        aria-hidden
      />
    </md-icon-button>
  );

  return (
    <div
      className={[
        'ccai-collapsed-response-wrap',
        isExpanded ? 'is-expanded' : 'is-collapsed',
        streaming ? 'is-streaming' : '',
        forceExpanded ? 'is-live' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleWrapClick}
      onKeyDown={handleWrapKeyDown}
      role={forceExpanded || isExpanded ? undefined : 'button'}
      tabIndex={forceExpanded || isExpanded ? undefined : 0}
      aria-expanded={isExpanded}
    >
      <MessageBubble
        message={message}
        idx={idx}
        messageIdx={messageIdx}
        prevMessage={prevMessage}
        participantNameById={participantNameById}
        showResponseTime={showResponseTime}
        expandToggle={expandToggle}
        contentClamped={!isExpanded}
      />
    </div>
  );
}
