import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight, Download, Settings2, Search,
  Square, CheckSquare, UserPlus, Table2,
} from 'lucide-react';

/**
 * Settings menu, structurally identical to LLMChats3 but populated with
 * CCAI controls:
 *   - Orchestrator model (searchable)
 *   - Summarizer model (searchable, with "Same as Orchestrator" default)
 *   - Max participants (3-9, default 5)
 *   - Per-participant model assignments
 *   - "Create Expert Persona..." shortcut
 *   - Display options + downloads (txt / md / csv-table / api-log)
 */
export default function DevMenu({
  allModels,
  orchestratorModel,
  onOrchestratorChange,
  summarizerModel,
  onSummarizerChange,
  speedPriority,
  onSpeedPriorityChange,
  showResponseTime,
  onShowResponseTimeChange,
  showChatStats,
  onShowChatStatsChange,
  maxParticipants,
  onMaxParticipantsChange,
  participants,
  modelAssignments,
  onModelAssignmentChange,
  onOpenExpertModal,
  onShowTableView,
  onDownloadChatTxt,
  onDownloadChatMd,
  onDownloadCsvTable,
  onDownloadApiLog,
  hasApiLog,
  hasChat,
}) {
  const [open, setOpen] = useState(false);
  const [activeSub, setActiveSub] = useState(null); // null | "orch" | "sum" | <participant_id>
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (activeSub && searchRef.current) searchRef.current.focus();
  }, [activeSub]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setActiveSub(null);
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

  const nameForModel = (id) => {
    if (!id) return null;
    const m = allModels.find(x => x.id === id);
    return m ? m.name : id;
  };
  const orchName = nameForModel(orchestratorModel) || 'Default (backend)';
  const sumName = summarizerModel
    ? (nameForModel(summarizerModel) || summarizerModel)
    : 'Same as Orchestrator';

  const onPickForSubject = (id, subject) => {
    if (subject === 'orch') onOrchestratorChange(id);
    else if (subject === 'sum') onSummarizerChange(id);
    else if (subject) onModelAssignmentChange(subject, id);
  };

  return (
    <div className="dev-wrap" ref={wrapRef}>
      <div className="dev-download-btns">
        <button className="btn-sm btn-outline" disabled={!hasChat} onClick={onDownloadChatTxt}>
          <Download size={14} /> .txt
        </button>
        <button className="btn-sm btn-outline" disabled={!hasChat} onClick={onDownloadChatMd}>
          <Download size={14} /> .md
        </button>
        <button
          className="btn-sm btn-outline"
          disabled={!hasChat}
          onClick={onShowTableView}
          title="Open the conversation summary table"
        >
          <Table2 size={14} /> Table
        </button>
        <button
          className="btn-sm btn-outline"
          disabled={!hasChat}
          onClick={onDownloadCsvTable}
          title="Download the table view as CSV"
        >
          <Download size={14} /> .csv
        </button>
      </div>

      <div className="dev-dropdown-header">
        <button
          className="icon-btn"
          onClick={() => { setOpen(o => !o); setActiveSub(null); setQ(''); }}
          title="Settings"
        >
          <Settings2 size={16} />
        </button>
        {open && (
          <div className="dev-panel">
            <button onClick={() => { setActiveSub(s => s === 'orch' ? null : 'orch'); setQ(''); }}>
              Orchestrator model… <span className="dev-panel-hint">{orchName}</span>
              <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </button>
            <button onClick={() => { setActiveSub(s => s === 'sum' ? null : 'sum'); setQ(''); }}>
              Summarizer model… <span className="dev-panel-hint">{sumName}</span>
              <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </button>

            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Max participants ({maxParticipants})</div>
            <div className="ccai-stepper-row">
              <button
                className="btn-sm btn-outline ccai-stepper-btn"
                disabled={maxParticipants <= 3}
                onClick={() => onMaxParticipantsChange(Math.max(3, maxParticipants - 1))}
              >−</button>
              <div className="ccai-stepper-val">{maxParticipants}</div>
              <button
                className="btn-sm btn-outline ccai-stepper-btn"
                disabled={maxParticipants >= 9}
                onClick={() => onMaxParticipantsChange(Math.min(9, maxParticipants + 1))}
              >+</button>
              <span className="dev-panel-hint">3-9</span>
            </div>

            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Participants</div>
            <button onClick={() => { onOpenExpertModal(null); setOpen(false); }}>
              <UserPlus size={14} className="dev-check-icon" />
              Create Expert Persona…
            </button>
            {(participants || []).length > 0 && (
              <div className="dev-panel-label">Per-participant model</div>
            )}
            {(participants || []).map(p => {
              const assigned = modelAssignments[p.participant_id];
              const labelName = assigned ? nameForModel(assigned)
                : (p.default_model_id ? nameForModel(p.default_model_id) : '(default)');
              return (
                <button
                  key={p.participant_id}
                  onClick={() => { setActiveSub(s => s === p.participant_id ? null : p.participant_id); setQ(''); }}
                >
                  {p.name}<span className="dev-panel-hint"> {labelName}</span>
                  <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
                </button>
              );
            })}

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

            <div className="dev-panel-divider" />
            <button disabled={!hasChat} className="dev-panel-download-item" onClick={() => { onDownloadChatTxt(); setOpen(false); }}>
              Download chat as .txt
            </button>
            <button disabled={!hasChat} className="dev-panel-download-item" onClick={() => { onDownloadChatMd(); setOpen(false); }}>
              Download chat as .md
            </button>
            <button disabled={!hasChat} className="dev-panel-download-item" onClick={() => { onDownloadCsvTable(); setOpen(false); }}>
              Download summary table as .csv
            </button>
            <button disabled={!hasApiLog} onClick={() => { onDownloadApiLog(); setOpen(false); }}>
              Download full API history
            </button>
          </div>
        )}

        {open && activeSub && (
          <div className="dev-sub-panel">
            <div className="dev-sub-header">
              <span className="dev-sub-title">
                {activeSub === 'orch' && 'Orchestrator model'}
                {activeSub === 'sum' && 'Summarizer model'}
                {activeSub !== 'orch' && activeSub !== 'sum' && (
                  <>Model for {participants.find(p => p.participant_id === activeSub)?.name || activeSub}</>
                )}
              </span>
              <span className="dev-sub-current">
                {activeSub === 'orch' && orchName}
                {activeSub === 'sum' && sumName}
                {activeSub !== 'orch' && activeSub !== 'sum' && (
                  nameForModel(modelAssignments[activeSub]) || '(default)'
                )}
              </span>
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
              {activeSub === 'sum' && (
                <li>
                  <button
                    className={`dev-sub-item ${!summarizerModel ? 'dev-sub-item-active' : ''}`}
                    onClick={() => { onPickForSubject(null, 'sum'); setActiveSub(null); setQ(''); }}
                  >
                    <strong>Same as Orchestrator (default)</strong>
                    <span className="dev-sub-provider">Use whichever model is currently the orchestrator</span>
                  </button>
                </li>
              )}
              {activeSub === 'orch' && (
                <li>
                  <button
                    className={`dev-sub-item ${!orchestratorModel ? 'dev-sub-item-active' : ''}`}
                    onClick={() => { onPickForSubject(null, 'orch'); setActiveSub(null); setQ(''); }}
                  >
                    <strong>Default (backend)</strong>
                    <span className="dev-sub-provider">Use server default</span>
                  </button>
                </li>
              )}
              {activeSub !== 'orch' && activeSub !== 'sum' && (
                <li>
                  <button
                    className={`dev-sub-item ${!modelAssignments[activeSub] ? 'dev-sub-item-active' : ''}`}
                    onClick={() => { onPickForSubject(null, activeSub); setActiveSub(null); setQ(''); }}
                  >
                    <strong>(persona default)</strong>
                    <span className="dev-sub-provider">Use the persona's bundled or saved default</span>
                  </button>
                </li>
              )}
              {filtered.map(m => {
                const currentId =
                  activeSub === 'orch' ? orchestratorModel
                    : activeSub === 'sum' ? summarizerModel
                    : modelAssignments[activeSub];
                return (
                  <li key={m.id}>
                    <button
                      className={`dev-sub-item ${currentId === m.id ? 'dev-sub-item-active' : ''}`}
                      onClick={() => { onPickForSubject(m.id, activeSub); setActiveSub(null); setQ(''); }}
                    >
                      <strong>{m.name}</strong>
                      <span className="dev-sub-provider">{m.provider}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
