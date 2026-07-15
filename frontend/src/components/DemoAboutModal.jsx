import React from 'react';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

/**
 * Short “About this demo” dialog opened from the header help (?) control.
 */
export default function DemoAboutModal({ isOpen, onClose }) {
  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="standard"
      headline="About this demo"
      actions={(
        <md-filled-button type="button" onClick={onClose}>
          Got it
        </md-filled-button>
      )}
    >
      <div className="md-typescale-body-medium demo-about-body">
        <p>
          Multiple AI personas — each with its own model and perspective —
          discuss your question together.
        </p>
        <p>
          An orchestrator guides the conversation through structured rounds,
          critiques, and a chosen decision method until the group reaches
          an outcome.
        </p>
        <p>
          You can optionally join as a human participant. When it&apos;s your
          turn, the panel pauses so you can contribute in the chat.
        </p>
      </div>
    </MdDialog>
  );
}
