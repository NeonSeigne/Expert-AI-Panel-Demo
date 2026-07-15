import React, { useEffect, useRef } from 'react';
import PreferencesForm from './settings/PreferencesForm';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

/**
 * Preferences / settings modal opened from the header gear.
 */
export default function PreferencesModal({ isOpen, onClose }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    bodyRef.current?.scrollTo?.(0, 0);
  }, [isOpen]);

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="large"
      headline="Preferences"
      actions={(
        <md-filled-button type="button" onClick={onClose}>
          Done
        </md-filled-button>
      )}
    >
      <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
        Tune how the panel discusses, decides, and displays results.
        Changes apply to the next chat you start.
      </p>
      <div ref={bodyRef}>
        <PreferencesForm showExtended onRequestClose={onClose} />
      </div>
    </MdDialog>
  );
}
