import React, { useEffect } from 'react';
import '../../neon/neon-material.register.js';

/**
 * Lightweight MD3-styled snackbar for brief status toasts.
 */
export default function MdSnackbar({ open, message, actionLabel, onAction, onClose, duration = 4000 }) {
  useEffect(() => {
    if (!open || !message) return undefined;
    const t = window.setTimeout(() => onClose?.(), duration);
    return () => window.clearTimeout(t);
  }, [open, message, duration, onClose]);

  if (!open || !message) return null;

  return (
    <div className="md-snackbar" role="status" aria-live="polite">
      <span className="md-snackbar__message md-typescale-body-medium">{message}</span>
      {actionLabel && onAction ? (
        <md-text-button type="button" onClick={onAction}>
          {actionLabel}
        </md-text-button>
      ) : null}
      <md-icon-button type="button" aria-label="Dismiss" onClick={onClose}>
        <md-icon>close</md-icon>
      </md-icon-button>
    </div>
  );
}
