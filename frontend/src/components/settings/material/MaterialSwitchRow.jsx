import React from 'react';
import '../../../neon/neon-material.register.js';

/**
 * Label + md-switch row. Controlled via selected / onChange(boolean).
 */
export default function MaterialSwitchRow({
  label,
  selected = false,
  onChange,
  title,
}) {
  const handleInput = (e) => {
    // md-switch toggles its own selected state; read the post-toggle value.
    const next = e?.target?.selected;
    onChange?.(typeof next === 'boolean' ? next : !selected);
  };

  return (
    <label
      className="onboarding-form-switch-row"
      title={title || ''}
    >
      <span className="onboarding-form-switch-label">{label}</span>
      <md-switch
        selected={!!selected}
        aria-label={label}
        onInput={handleInput}
      />
    </label>
  );
}
