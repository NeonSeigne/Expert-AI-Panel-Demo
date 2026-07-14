import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Searchable model list used by DevMenu and onboarding preferences.
 *
 * subject: 'orch' | 'sum' | <participant_id>
 */
export default function ModelPickerList({
  models = [],
  subject,
  subjectLabel,
  currentId,
  currentLabel,
  onPick,
  onClose,
  allowNullDefault = true,
  nullLabel,
  nullHint,
}) {
  const [q, setQ] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, [subject]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return models;
    return models.filter((row) => {
      const hay = `${row.name} ${row.id} ${row.provider || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [models, q]);

  const handlePick = (id) => {
    onPick?.(id, subject);
    onClose?.();
    setQ('');
  };

  return (
    <div className="dev-sub-panel model-picker-list">
      <div className="dev-sub-header">
        <span className="dev-sub-title">{subjectLabel}</span>
        <span className="dev-sub-current">{currentLabel}</span>
      </div>
      <div className="dev-sub-search">
        <Search size={14} className="dev-sub-search-icon" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search models…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="dev-sub-list">
        {allowNullDefault && (
          <li>
            <button
              type="button"
              className={`dev-sub-item ${!currentId ? 'dev-sub-item-active' : ''}`}
              onClick={() => handlePick(null)}
            >
              <strong>{nullLabel || '(default)'}</strong>
              {nullHint && (
                <span className="dev-sub-provider">{nullHint}</span>
              )}
            </button>
          </li>
        )}
        {filtered.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={`dev-sub-item ${currentId === m.id ? 'dev-sub-item-active' : ''}`}
              onClick={() => handlePick(m.id)}
            >
              <strong>{m.name}</strong>
              <span className="dev-sub-provider">{m.provider}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
