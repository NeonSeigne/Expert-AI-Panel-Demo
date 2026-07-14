import React from 'react';
import NeonDesignRoot from '../NeonDesignRoot';
import NeonChatBubble from '../../neon/NeonChatBubble';

/**
 * Decorative onboarding chat illustration: staggered product bubbles.
 * Message content is exposed once via visually-hidden text for screen readers.
 */
export default function OnboardingChatGraphic({
  messages = [],
  className = '',
}) {
  const srText = messages.map((m) => m.content).filter(Boolean).join(' ');

  return (
    <div
      className={`onboarding-chat-graphic${className ? ` ${className}` : ''}`}
    >
      {srText ? <p className="onboarding-sr-only">{srText}</p> : null}
      <div
        role="presentation"
        aria-hidden="true"
        className="onboarding-chat-graphic-inner"
      >
        <NeonDesignRoot className="onboarding-chat-graphic-thread">
          {messages.map((message, index) => {
            const {
              rowClassName = '',
              content,
              markdown,
              ...bubbleProps
            } = message;
            return (
              <NeonChatBubble
                key={`${index}-${content?.slice?.(0, 24) || index}`}
                content={content}
                markdown={markdown ?? false}
                rowClassName={[
                  `onboarding-chat-graphic-row onboarding-chat-graphic-row--${index + 1}`,
                  rowClassName,
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...bubbleProps}
              />
            );
          })}
        </NeonDesignRoot>
      </div>
    </div>
  );
}
