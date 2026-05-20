import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Settings modal for the user-tunable repetition / failsafe limits.
 *
 * The schema (defaults, bounds, descriptions, group assignments) is
 * fetched from GET /api/chat/limits/defaults so the entire UI is
 * server-driven: adding a knob in `services.models.ConversationLimits`
 * makes it appear here automatically. The user's overrides are
 * persisted to localStorage and sent on the next /chat/start, where
 * the backend re-clamps them to the declared bounds.
 *
 * "Effective" values shown to the user are: override (if set) ->
 * server default. Values are pre-clamped client-side too so the
 * stepper UI stays in range.
 */
export default function ConversationLimitsModal({
  isOpen,
  schema,
  overrides,
  onClose,
  onChange,
  onResetAll,
}) {
  const [draft, setDraft] = useState(() => ({ ...(overrides || {}) }));

  // Reset draft whenever the modal is reopened so we don't leak edits
  // from a previous open.
  React.useEffect(() => {
    if (isOpen) setDraft({ ...(overrides || {}) });
  }, [isOpen, overrides]);

  const grouped = useMemo(() => groupFields(schema), [schema]);

  if (!isOpen) return null;

  if (!schema) {
    return (
      <div className="ccai-credentials-overlay">
        <div className="ccai-credentials-card">
          <div className="ccai-credentials-header">
            <div>
              <h2>Conversation limits</h2>
            </div>
            <div className="ccai-tab-spacer" />
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="ccai-credentials-body">
            <div className="ccai-credentials-empty">Loading limits...</div>
          </div>
        </div>
      </div>
    );
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

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Conversation limits</h2>
            <div className="ccai-credentials-subtitle">
              These knobs control how long each phase of the discussion
              runs and when the conversation pauses for a Continue
              confirmation. Changes apply to the next chat you start.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          <button
            className="btn-sm btn-outline"
            onClick={handleResetAll}
            title="Restore every knob to the server default"
          >
            <RotateCcw size={14} style={{ marginRight: 4 }} />
            Reset all
          </button>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ccai-credentials-body">
          {grouped.map(({ group, fields }) => (
            <div key={group} className="ccai-limits-group">
              <div className="ccai-limits-group-title">{group}</div>
              {fields.map((f) => (
                <LimitRow
                  key={f.field}
                  field={f.field}
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
          ))}
        </div>
      </div>
    </div>
  );
}

function LimitRow({
  field,
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

  const setClamped = (raw) => {
    if (raw === '' || raw === null || raw === undefined) {
      // Empty input = revert to default for this field.
      onResetField();
      return;
    }
    let n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    if (n < min) n = min;
    if (n > max) n = max;
    onChange(n);
  };

  return (
    <div className="ccai-limit-row">
      <div className="ccai-limit-row-head">
        <label className="ccai-limit-label" htmlFor={`limit-${field}`}>
          {label}
        </label>
        <div className="ccai-limit-stepper">
          <input
            id={`limit-${field}`}
            type="number"
            min={min}
            max={max}
            step={1}
            value={effective}
            onChange={(e) => setClamped(e.target.value)}
            className="ccai-limit-input"
          />
          <span className="ccai-limit-range">
            ({min}-{max}, default {defaultValue})
          </span>
          {isOverride && (
            <button
              className="ccai-limit-reset"
              onClick={onResetField}
              title="Reset this field to the default"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <div className="ccai-limit-help">{help}</div>
    </div>
  );
}

/**
 * Convert the flat `descriptions` map into [{group, fields[]}] in
 * the order the groups first appear, then the order each field is
 * declared in `bounds` (which mirrors the dataclass field order).
 */
function groupFields(schema) {
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
