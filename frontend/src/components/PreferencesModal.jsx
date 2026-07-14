import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import PreferencesForm from './settings/PreferencesForm';

/**
 * Preferences / settings modal opened from the header gear.
 * Single scrollable page; secondary controls live under Advanced Preferences.
 */
export default function PreferencesModal({ isOpen, onClose }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    bodyRef.current?.scrollTo?.(0, 0);
  }, [isOpen]);

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
      <div className="onboarding-frame preferences-frame">
        <div
          className="ccai-credentials-card onboarding-card preferences-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preferences-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="preferences-card-close"
            onClick={onClose}
            aria-label="Close preferences"
          >
            <X size={18} aria-hidden />
          </button>

          <div className="onboarding-card-body" ref={bodyRef}>
            <div className="onboarding-step onboarding-step--preferences">
              <h2 id="preferences-modal-title" className="onboarding-step-title">
                Preferences
              </h2>
              <p className="onboarding-step-lede">
                Tune how the panel discusses, decides, and displays results.
                Changes apply to the next chat you start.
              </p>
              <PreferencesForm showExtended onRequestClose={onClose} />
            </div>
          </div>

          <div className="onboarding-card-footer">
            <button
              type="button"
              className="onboarding-finish-btn preferences-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
