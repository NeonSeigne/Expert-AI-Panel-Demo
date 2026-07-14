import React from 'react';
import '../../neon/neon-material.register.js';

/**
 * Large choice cards matching the onboarding human Yes/No pattern.
 * Always a wrap-safe 2-column grid so 4 options become a tidy 2×2.
 * options: [{ value, label, description?, icon? }]
 * icon: Material Symbols Outlined ligature name (e.g. "groups")
 */
export default function PreferenceChoiceCards({
  label,
  value,
  onChange,
  options = [],
}) {
  return (
    <div className="onboarding-form-section preferences-choice-section">
      {label && (
        <div className="onboarding-form-section-label">{label}</div>
      )}
      <div
        className="preferences-choice-cards"
        role="radiogroup"
        aria-label={label || 'Choices'}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              className={
                'onboarding-choice-card preferences-choice-card'
                + (selected ? ' onboarding-choice-card--active' : '')
              }
              onClick={() => onChange?.(opt.value)}
            >
              {opt.icon ? (
                <md-icon className="preferences-choice-card-icon" aria-hidden="true">
                  {opt.icon}
                </md-icon>
              ) : null}
              <strong>{opt.label}</strong>
              {opt.description ? <span>{opt.description}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
