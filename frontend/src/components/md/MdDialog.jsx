import React, { useEffect, useRef } from 'react';
import '../../neon/neon-material.register.js';

/**
 * Thin React adapter around Material Web <md-dialog>.
 */
export default function MdDialog({
  open,
  onClose,
  headline,
  actions,
  children,
  size = 'standard',
  className = '',
  alert = false,
}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const handleClose = () => {
      onCloseRef.current?.();
    };
    el.addEventListener('close', handleClose);
    el.addEventListener('cancel', handleClose);
    return () => {
      el.removeEventListener('close', handleClose);
      el.removeEventListener('cancel', handleClose);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Boolean(open) !== Boolean(el.open)) {
      el.open = Boolean(open);
    }
  }, [open]);

  const sizeClass = size === 'large'
    ? 'md-dialog--large'
    : size === 'fullscreen-compact'
      ? 'md-dialog--fullscreen'
      : 'md-dialog--standard';

  return (
    <md-dialog
      ref={ref}
      class={`md-dialog-host ${sizeClass}${className ? ` ${className}` : ''}`}
      {...(alert ? { type: 'alert' } : {})}
    >
      {headline != null && (
        <div slot="headline" className="md-dialog-headline md-typescale-headline-small">
          {headline}
        </div>
      )}
      <div slot="content" className="md-dialog-content">
        {children}
      </div>
      {actions != null && (
        <div slot="actions" className="md-dialog-actions">
          {actions}
        </div>
      )}
    </md-dialog>
  );
}
