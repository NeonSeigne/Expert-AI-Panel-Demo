import React from 'react';
import '../../../neon/neon-material.register.js';

/**
 * Label + help + md-slider row. Controlled via value / onChange(number).
 * Optional onReset shows a reset control when isOverride is true.
 */
export default function MaterialSliderRow({
  label,
  help,
  min,
  max,
  value,
  defaultValue,
  step = 1,
  isOverride = false,
  onChange,
  onReset,
}) {
  const handleInput = (e) => {
    const raw = e?.target?.value;
    let n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    if (n < min) n = min;
    if (n > max) n = max;
    onChange?.(n);
  };

  return (
    <div className="onboarding-form-slider-row" title={help || ''}>
      <div className="onboarding-form-slider-head">
        <div className="onboarding-form-slider-titles">
          <div className="onboarding-form-slider-label-row">
            <span className="onboarding-form-slider-label">{label}</span>
            <span className="onboarding-form-slider-value">{value}</span>
          </div>
          {help ? (
            <p className="onboarding-form-slider-help">{help}</p>
          ) : null}
        </div>
        {isOverride && onReset ? (
          <button
            type="button"
            className="ccai-limit-reset onboarding-limit-reset"
            onClick={onReset}
            title={`Reset to default (${defaultValue})`}
          >
            reset
          </button>
        ) : null}
      </div>
      <md-slider
        min={min}
        max={max}
        step={step}
        value={value}
        labeled
        aria-label={label}
        onInput={handleInput}
        onChange={handleInput}
        className="onboarding-form-slider"
      />
      <div className="onboarding-form-slider-range">
        <span>{min}</span>
        <span>default {defaultValue}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
