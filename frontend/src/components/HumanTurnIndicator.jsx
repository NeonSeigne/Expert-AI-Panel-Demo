import React from 'react';
import { ArrowDown } from 'lucide-react';

/**
 * Fixed-position attention cue rendered along the bottom edge of the
 * viewport when the orchestrator is waiting for the human's input.
 *
 * Per the spec we do NOT auto-scroll - the user might be reading
 * earlier messages and resent the page jumping under them. We just
 * surface a persistent green pulse + arrow + name so they can scroll
 * down to the input slot on their own when ready.
 *
 * Clicking the indicator scrolls the input slot into view (best
 * effort: we look for [data-human-slot] in the DOM).
 */
export default function HumanTurnIndicator({ awaiting }) {
  if (!awaiting) return null;
  const name = awaiting.speaker_name || 'you';
  const handleClick = () => {
    const target = document.querySelector('[data-human-slot]');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const ta = target.querySelector('textarea');
      if (ta) ta.focus({ preventScroll: true });
    }
  };
  return (
    <button
      type="button"
      className="ccai-human-indicator"
      onClick={handleClick}
      title={`Jump to ${name}'s input slot`}
    >
      <ArrowDown
        size={16}
        strokeWidth={2.5}
        className="ccai-human-indicator-arrow"
      />
      <span className="ccai-human-indicator-text">
        {name}, the discussion is waiting for your input
      </span>
    </button>
  );
}
