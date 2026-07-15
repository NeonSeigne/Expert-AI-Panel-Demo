import React from 'react';
import { Play } from 'lucide-react';
import '../neon/neon-material.register.js';

/**
 * Inline banner shown when the orchestrator hits one of the two
 * failsafes (60+20 messages, 100+50 orchestrator calls). User clicks
 * Continue to grant another batch.
 */
export default function FailsafePauseBanner({ pause, onContinue }) {
  if (!pause) return null;
  const incLabel = pause.reason === 'messages' ? '+20 messages' : '+50 orchestrator calls';
  const titleLabel = pause.reason === 'messages'
    ? 'Conversation paused (message cap)'
    : 'Conversation paused (orchestrator call cap)';
  return (
    <div className="ccai-failsafe-banner">
      <div>
        <div className="ccai-failsafe-title">{titleLabel}</div>
        <div className="ccai-failsafe-text">{pause.message}</div>
      </div>
      <md-filled-button type="button" onClick={() => onContinue(pause.reason)}>
        <Play size={14} slot="icon" aria-hidden />
        Continue conversation ({incLabel})
      </md-filled-button>
    </div>
  );
}
