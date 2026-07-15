import React from 'react';
import { useSettings } from '../context/SettingsContext';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

const COPY = {
  one_left: {
    title: 'One chat remaining today',
    body: (
      <>
        You have one chat left for today. Contact us at{' '}
        <a href="mailto:info@neon.ai">info@neon.ai</a> if you would like to do
        more with CCAI.
      </>
    ),
  },
  exhausted: {
    title: 'Daily chat limit reached',
    body: (
      <>
        You have used all of your chats for today. Contact us at{' '}
        <a href="mailto:info@neon.ai">info@neon.ai</a> if you would like to do
        more with CCAI.
      </>
    ),
  },
};

export default function RateLimitNotice() {
  const { rateLimitNotice: kind, setRateLimitNotice } = useSettings();
  const onClose = () => setRateLimitNotice(null);
  const copy = kind ? COPY[kind] : null;

  return (
    <MdDialog
      open={Boolean(copy)}
      alert
      onClose={onClose}
      headline={copy?.title || ''}
      actions={(
        <md-filled-button type="button" onClick={onClose}>
          OK
        </md-filled-button>
      )}
    >
      <div className="md-typescale-body-medium">{copy?.body}</div>
    </MdDialog>
  );
}
