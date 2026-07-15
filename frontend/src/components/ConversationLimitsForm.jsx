import React, { useMemo, useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import '../neon/neon-material.register.js';
import NeonDesignRoot from './NeonDesignRoot';
import MaterialSliderRow from './settings/material/MaterialSliderRow';

/**
 * Server-driven conversation-limits form body.
 * Used by ConversationLimitsModal and PreferencesForm Advanced section.
 * Set embedded when nesting inside another NeonDesignRoot/scroll parent.
 */
export default function ConversationLimitsForm({
  schema,
  overrides,
  onChange,
  onResetAll,
  showResetAll = true,
  embedded = false,
  className = '',
}) {
  const [draft, setDraft] = useState(() => ({ ...(overrides || {}) }));

  useEffect(() => {
    setDraft({ ...(overrides || {}) });
  }, [overrides]);

  const grouped = useMemo(() => groupFields(schema), [schema]);

  if (!schema) {
    return <div className="onboarding-form-loading">Loading limits…</div>;
  }

  const handleChange = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    onChange?.(next);
  };

  const handleResetField = (field) => {
    const next = { ...draft };
    delete next[field];
    setDraft(next);
    onChange?.(next);
  };

  const handleResetAll = () => {
    setDraft({});
    onResetAll?.();
  };

  const body = (
    <div className={`onboarding-limits-form ${className}`.trim()}>
      {showResetAll && (
        <div className="onboarding-limits-form-toolbar">
          <md-outlined-button
            type="button"
            onClick={handleResetAll}
            title="Restore every knob to the server default"
          >
            <RotateCcw size={14} slot="icon" aria-hidden />
            Reset all
          </md-outlined-button>
        </div>
      )}
      {grouped.map(({ group, fields }) => (
        <div key={group} className="onboarding-form-section onboarding-form-section--limits">
          <div className="onboarding-form-section-label">{group}</div>
          <div className="onboarding-form-limit-grid">
            {fields.map((f) => (
              <LimitRow
                key={f.field}
                label={f.label}
                help={f.help}
                defaultValue={f.defaultValue}
                min={f.min}
                max={f.max}
                override={draft[f.field]}
                onChange={(v) => handleChange(f.field, v)}
                onResetField={() => handleResetField(f.field)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <NeonDesignRoot className="onboarding-form-root">
      {body}
    </NeonDesignRoot>
  );
}

function LimitRow({
  label,
  help,
  defaultValue,
  min,
  max,
  override,
  onChange,
  onResetField,
}) {
  const isOverride = override !== undefined && override !== null;
  const effective = isOverride ? override : defaultValue;

  return (
    <MaterialSliderRow
      label={label}
      help={help}
      min={min}
      max={max}
      value={effective}
      defaultValue={defaultValue}
      step={1}
      isOverride={isOverride}
      onChange={onChange}
      onReset={onResetField}
    />
  );
}

/**
 * Convert the flat `descriptions` map into [{group, fields[]}] in
 * the order the groups first appear, then the order each field is
 * declared in `bounds` (which mirrors the dataclass field order).
 */
export function groupFields(schema) {
  if (!schema) return [];
  const { defaults, bounds, descriptions } = schema;
  const orderedFields = Object.keys(bounds);
  const seen = new Map();
  for (const field of orderedFields) {
    const desc = descriptions[field] || {};
    const group = desc.group || 'Other';
    if (!seen.has(group)) seen.set(group, []);
    seen.get(group).push({
      field,
      label: desc.label || field,
      help: desc.help || '',
      defaultValue: defaults[field],
      min: bounds[field].min,
      max: bounds[field].max,
    });
  }
  return Array.from(seen.entries()).map(([group, fields]) => ({ group, fields }));
}
