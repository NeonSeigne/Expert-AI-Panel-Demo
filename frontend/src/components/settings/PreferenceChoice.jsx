import React from 'react';
import { Square, CheckSquare } from 'lucide-react';

/**
 * Shared checkbox/radio-style choice row used by DevMenu and onboarding.
 */
export default function PreferenceChoice({
  active = false,
  onClick,
  title,
  children,
}) {
  return (
    <button
      type="button"
      className={`dev-panel-choice ${active ? 'dev-panel-choice-active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {active
        ? <CheckSquare size={16} className="dev-check-icon" />
        : <Square size={16} className="dev-check-icon" />}
      {children}
    </button>
  );
}
