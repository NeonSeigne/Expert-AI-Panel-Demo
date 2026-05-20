import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronRight, Download, Settings2, Search, Check, Eye, EyeOff, FileText, Square, CheckSquare } from 'lucide-react';

export default function DevMenu({
  allModels,
  orchestratorModel,
  onOrchestratorChange,
  personaMode,
  onPersonaModeChange,
  roleStyle,
  onRoleStyleChange,
  speedPriority,
  onSpeedPriorityChange,
  showResponseTime,
  onShowResponseTimeChange,
  showChatStats,
  onShowChatStatsChange,
  rolePrompts,
  onShowRolePrompts,
  onDownloadApiLog,
  onDownloadChatTxt,
  onDownloadChatMd,
  hasApiLog,
  hasChat,
}) {
  const [open, setOpen] = useState(false);
  const [orchOpen, setOrchOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (orchOpen && searchRef.current) searchRef.current.focus();
  }, [orchOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setOrchOpen(false);
        setQ('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allModels;
    return allModels.filter(row => {
      const hay = `${row.name} ${row.id} ${row.provider || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [allModels, q]);

  const currentName = useMemo(() => {
    if (!orchestratorModel) return 'Default (backend)';
    const m = allModels.find(m => m.id === orchestratorModel);
    return m ? m.name : orchestratorModel;
  }, [orchestratorModel, allModels]);

  return (
    <div className="dev-wrap" ref={wrapRef}>
      <div className="dev-download-btns">
        <button className="btn-sm btn-outline" disabled={!hasChat} onClick={onDownloadChatTxt}>
          <Download size={14} /> .txt
        </button>
        <button className="btn-sm btn-outline" disabled={!hasChat} onClick={onDownloadChatMd}>
          <Download size={14} /> .md
        </button>
      </div>

      <div className="dev-dropdown-header">
        <button className="icon-btn" onClick={() => { setOpen(o => !o); setOrchOpen(false); setQ(''); }} title="Settings">
          <Settings2 size={16} />
        </button>
        {open && (
          <div className="dev-panel">
            <button onClick={() => { setOrchOpen(o => !o); setQ(''); }}>
              Orchestrator model… <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </button>
            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Response priority</div>
            <button
              className={`dev-panel-choice ${!speedPriority ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onSpeedPriorityChange(false)}
            >
              {!speedPriority ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Prioritize model choice
            </button>
            <button
              className={`dev-panel-choice ${speedPriority ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onSpeedPriorityChange(true)}
            >
              {speedPriority ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Prioritize conversation speed
            </button>
            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Expert persona input</div>
            <button
              className={`dev-panel-choice ${personaMode === 'structured' ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onPersonaModeChange('structured')}
            >
              {personaMode === 'structured' ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Structured expert persona input
            </button>
            <button
              className={`dev-panel-choice ${personaMode === 'freeform' ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onPersonaModeChange('freeform')}
            >
              {personaMode === 'freeform' ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Freeform expert persona input
            </button>
            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Role generation</div>
            <button
              className={`dev-panel-choice ${roleStyle === 'ai_completed' ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onRoleStyleChange('ai_completed')}
            >
              {roleStyle === 'ai_completed' ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              AI completed roles
            </button>
            <button
              className={`dev-panel-choice ${roleStyle === 'exact' ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onRoleStyleChange('exact')}
            >
              {roleStyle === 'exact' ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Exact user roles
            </button>
            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Display options</div>
            <button
              className={`dev-panel-choice ${showResponseTime ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onShowResponseTimeChange(!showResponseTime)}
            >
              {showResponseTime ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Response times on messages
            </button>
            <button
              className={`dev-panel-choice ${showChatStats ? 'dev-panel-choice-active' : ''}`}
              onClick={() => onShowChatStatsChange(!showChatStats)}
            >
              {showChatStats ? <CheckSquare size={16} className="dev-check-icon" /> : <Square size={16} className="dev-check-icon" />}
              Chat stats after end
            </button>
            <button className="dev-panel-choice" disabled={!rolePrompts} onClick={() => { onShowRolePrompts(); setOpen(false); }}>
              <FileText size={14} className="dev-check-icon" />
              View role prompts
            </button>
            <div className="dev-panel-divider" />
            <button disabled={!hasChat} className="dev-panel-download-item" onClick={() => { onDownloadChatTxt(); setOpen(false); }}>
              Download chat as .txt
            </button>
            <button disabled={!hasChat} className="dev-panel-download-item" onClick={() => { onDownloadChatMd(); setOpen(false); }}>
              Download chat as .md
            </button>
            <button disabled={!hasApiLog} onClick={() => { onDownloadApiLog(); setOpen(false); }}>
              Download full API history
            </button>
          </div>
        )}

        {open && orchOpen && (
          <div className="dev-sub-panel">
            <div className="dev-sub-header">
              <span className="dev-sub-title">Orchestrator</span>
              <span className="dev-sub-current">{currentName}</span>
            </div>
            <div className="dev-sub-search">
              <Search size={14} className="dev-sub-search-icon" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search models…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <ul className="dev-sub-list">
              <li>
                <button
                  className={`dev-sub-item ${!orchestratorModel ? 'dev-sub-item-active' : ''}`}
                  onClick={() => { onOrchestratorChange(null); setOrchOpen(false); setOpen(false); setQ(''); }}
                >
                  <strong>Default (backend)</strong>
                  <span className="dev-sub-provider">Use server default</span>
                </button>
              </li>
              {filtered.map(m => (
                <li key={m.id}>
                  <button
                    className={`dev-sub-item ${orchestratorModel === m.id ? 'dev-sub-item-active' : ''}`}
                    onClick={() => { onOrchestratorChange(m.id); setOrchOpen(false); setOpen(false); setQ(''); }}
                  >
                    <strong>{m.name}</strong>
                    <span className="dev-sub-provider">{m.provider}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
