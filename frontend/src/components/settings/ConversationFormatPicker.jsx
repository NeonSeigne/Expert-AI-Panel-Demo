import React from 'react';
import { Square, CheckSquare } from 'lucide-react';

/**
 * Two stacked radio-style pickers for the conversation structure and
 * decision-making method. Driven entirely by the server catalog so
 * adding a plugin doesn't need a code change here. A null current
 * selection means "follow the backend's default" — we highlight that
 * default but the explicit user choice always wins when set.
 */
export default function ConversationFormatPicker({
  catalog,
  structureId,
  onStructureChange,
  decisionId,
  onDecisionChange,
}) {
  const structures = Array.isArray(catalog?.structures) ? catalog.structures : [];
  const decisions = Array.isArray(catalog?.decisions) ? catalog.decisions : [];
  const defStruct = catalog?.default_structure_id || null;
  const defDec = catalog?.default_decision_id || null;
  const effectiveStruct = structureId || defStruct;
  const effectiveDec = decisionId || defDec;

  return (
    <>
      <div className="dev-panel-label dev-panel-sublabel">Discussion structure</div>
      {structures.length === 0 && (
        <div className="dev-panel-hint" style={{ padding: '4px 10px' }}>
          (catalog unavailable)
        </div>
      )}
      {structures.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`dev-panel-choice ${effectiveStruct === s.id ? 'dev-panel-choice-active' : ''}`}
          onClick={() => onStructureChange?.(s.id)}
          title={s.description || ''}
        >
          {effectiveStruct === s.id
            ? <CheckSquare size={16} className="dev-check-icon" />
            : <Square size={16} className="dev-check-icon" />}
          {s.name}
        </button>
      ))}

      <div className="dev-panel-label dev-panel-sublabel" style={{ marginTop: 6 }}>
        Decision method
      </div>
      {decisions.length === 0 && (
        <div className="dev-panel-hint" style={{ padding: '4px 10px' }}>
          (catalog unavailable)
        </div>
      )}
      {decisions.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`dev-panel-choice ${effectiveDec === d.id ? 'dev-panel-choice-active' : ''}`}
          onClick={() => onDecisionChange?.(d.id)}
          title={d.description || ''}
        >
          {effectiveDec === d.id
            ? <CheckSquare size={16} className="dev-check-icon" />
            : <Square size={16} className="dev-check-icon" />}
          {d.name}
        </button>
      ))}
    </>
  );
}
