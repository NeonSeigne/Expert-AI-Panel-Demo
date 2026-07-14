import React, { useState } from 'react';
import '../neon/neon-material.register.js';
import PreferencesModal from './PreferencesModal';

/**
 * Header settings control — opens the Preferences modal.
 */
export default function DevMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <md-icon-button
        className="header-icon-btn"
        aria-label="Preferences"
        title="Preferences"
        onClick={() => setOpen(true)}
      >
        <md-icon>settings</md-icon>
      </md-icon-button>
      <PreferencesModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
