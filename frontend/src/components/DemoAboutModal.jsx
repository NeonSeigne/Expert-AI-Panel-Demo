import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import '../neon/neon-material.register.js';
import NeonDesignRoot from './NeonDesignRoot';

/**
 * Short “About this demo” dialog opened from the header help (?) control.
 */
export default function DemoAboutModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="ccai-credentials-overlay onboarding-overlay preferences-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <NeonDesignRoot className="demo-about-md">
        <div
          className="ccai-credentials-card onboarding-card demo-about-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-about-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="preferences-card-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} aria-hidden />
          </button>

          <h2 id="demo-about-title" className="onboarding-step-title">
            About this demo
          </h2>

          <div className="onboarding-step-body onboarding-intro-list demo-about-body">
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

          <div className="demo-about-actions">
            <md-filled-button type="button" onClick={onClose}>
              Got it
            </md-filled-button>
          </div>
        </div>
      </NeonDesignRoot>
    </div>
  );
}
