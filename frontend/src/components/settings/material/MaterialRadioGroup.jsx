import React from 'react';
import '../../../neon/neon-material.register.js';

/**
 * Labeled Material radio group. options: [{ value, label, title? }].
 */
export default function MaterialRadioGroup({
  name,
  label,
  options = [],
  value,
  onChange,
}) {
  return (
    <fieldset className="onboarding-form-fieldset">
      {label && <legend className="onboarding-form-section-label">{label}</legend>}
      <div className="onboarding-form-radio-list" role="radiogroup" aria-label={label || name}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={String(opt.value)}
              className={
                'onboarding-form-radio-row'
                + (selected ? ' onboarding-form-radio-row--selected' : '')
              }
              title={opt.title || ''}
            >
              <md-radio
                name={name}
                value={String(opt.value)}
                checked={selected}
                onChange={() => onChange?.(opt.value)}
                onClick={() => onChange?.(opt.value)}
              />
              <span className="onboarding-form-radio-label">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
