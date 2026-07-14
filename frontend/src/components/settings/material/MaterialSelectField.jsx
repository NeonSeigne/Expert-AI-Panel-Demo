import React, { useId } from 'react';

/**
 * Material-styled field that opens a native system <select> menu.
 * options: [{ value, label }]. Empty-string value is used for defaults.
 */
export default function MaterialSelectField({
  label,
  value = '',
  options = [],
  onChange,
  disabled = false,
}) {
  const id = useId();
  const selectId = `md-native-select-${id}`;

  const handleChange = (e) => {
    const next = e?.target?.value ?? '';
    onChange?.(next === '' ? null : next);
  };

  return (
    <div className={`onboarding-form-select-field${disabled ? ' onboarding-form-select-field--disabled' : ''}`}>
      {label && (
        <label className="onboarding-form-field-label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className="onboarding-form-select-shell">
        <select
          id={selectId}
          className="onboarding-form-select"
          value={value == null ? '' : String(value)}
          onChange={handleChange}
          disabled={disabled || undefined}
          aria-label={label || 'Select'}
        >
          {options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="onboarding-form-select-chevron" aria-hidden="true" />
      </div>
    </div>
  );
}
