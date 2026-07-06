import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, Settings2, Search, Sun, Moon,
  Square, CheckSquare, UserPlus, ScrollText, SlidersHorizontal,
  BookOpen,
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';

export default function DevMenu() {
  const {
    theme,
    toggleTheme,
    allModelsFlat: allModels,
    orchestratorModel,
    handleOrchestratorChange: onOrchestratorChange,
    summarizerModel,
    handleSummarizerChange: onSummarizerChange,
    speedPriority,
    handleSpeedPriorityChange: onSpeedPriorityChange,
    conversationFormats,
    conversationStructureId,
    handleConversationStructureChange: onConversationStructureChange,
    decisionMethodId,
    handleDecisionMethodChange: onDecisionMethodChange,
    showResponseTime,
    setShowResponseTime: onShowResponseTimeChange,
    showChatStats,
    setShowChatStats: onShowChatStatsChange,
    maxParticipants,
    handleShowConversationLimits: onShowConversationLimits,
    handleShowPromptCatalog: onShowPromptCatalog,
    limitsOverrides,
  } = useSettings();

  const {
    selectedParticipants: participants,
    modelAssignments,
    handleModelAssignmentChange: onModelAssignmentChange,
    handleOpenExpertModal: onOpenExpertModal,
    handleMaxParticipantsChange: onMaxParticipantsChange,
  } = useParticipants();

  const {
    hasCredentials,
    handleShowCredentials: onShowCredentials,
  } = useChatSession();

  const conversationLimitsOverridden = Object.keys(limitsOverrides).length > 0;
  const onToggleTheme = toggleTheme;
  const [open, setOpen] = useState(false);
  const [activeSub, setActiveSub] = useState(null); // null | "orch" | "sum" | <participant_id>
  const [q, setQ] = useState('');
  // Collapsed-by-default accordions. Keys correspond to the section
  // ids the SectionHeader below toggles. If we ever add a fifth
  // multi-item category, just add a key here.
  const [openSections, setOpenSections] = useState({
    modelSel: false,
    conversationFormat: false,
    responsePriority: false,
    display: false,
    transparency: false,
  });
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

  // Toggle a multi-item accordion. Closing the Model Selection section
  // while a model sub-panel is open would leave the sub-panel orphaned
  // (its anchor row is no longer rendered), so we also clear activeSub
  // in that case.
  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (id === 'modelSel' && !next.modelSel) {
        setActiveSub(null);
        setQ('');
      }
      return next;
    });
  };

  const modelSelOpen = openSections.modelSel;

  return (
    <div className="dev-wrap" ref={wrapRef}>
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

            {/* ── Theme (single item) ─────────────────────────────── */}
            <div className="dev-panel-label">Theme</div>
            <button
              className="dev-panel-row"
              onClick={onToggleTheme}
              title="Toggle light/dark mode"
            >
              {theme === 'light'
                ? <Moon size={14} className="dev-check-icon" />
                : <Sun size={14} className="dev-check-icon" />}
              {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            </button>

            <div className="dev-panel-divider" />

            {/* ── Model Selection (accordion: merged Models + Participants) ─ */}
            <SectionHeader
              label="Model Selection"
              open={modelSelOpen}
              onToggle={() => toggleSection('modelSel')}
            />
            {modelSelOpen && (
              <>
                <button
                  className="dev-panel-row dev-panel-row-stack"
                  onClick={() => { setActiveSub(s => s === 'orch' ? null : 'orch'); setQ(''); }}
                >
                  <div className="dev-panel-row-text">
                    <div className="dev-panel-row-name">Orchestrator model…</div>
                    <div className="dev-panel-row-sub">{orchName}</div>
                  </div>
                  <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                </button>
                <button
                  className="dev-panel-row dev-panel-row-stack"
                  onClick={() => { setActiveSub(s => s === 'sum' ? null : 'sum'); setQ(''); }}
                >
                  <div className="dev-panel-row-text">
                    <div className="dev-panel-row-name">Summarizer model…</div>
                    <div className="dev-panel-row-sub">{sumName}</div>
                  </div>
                  <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                </button>
                <button
                  className="dev-panel-row"
                  onClick={() => { onOpenExpertModal(null); setOpen(false); }}
                >
                  <UserPlus size={14} className="dev-check-icon" />
                  Create Expert Persona…
                </button>
                {(participants || []).map(p => {
                  const assigned = modelAssignments[p.participant_id];
                  const labelName = assigned ? nameForModel(assigned)
                    : (p.default_model_id ? nameForModel(p.default_model_id) : '(default)');
                  return (
                    <button
                      key={p.participant_id}
                      className="dev-panel-row dev-panel-row-stack"
                      onClick={() => { setActiveSub(s => s === p.participant_id ? null : p.participant_id); setQ(''); }}
                    >
                      <div className="dev-panel-row-text">
                        <div className="dev-panel-row-name">{p.name}</div>
                        <div className="dev-panel-row-sub">{labelName}</div>
                      </div>
                      <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                    </button>
                  );
                })}
              </>
            )}

            <div className="dev-panel-divider" />

            {/* ── Max participants (single item) ─────────────────── */}
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

            {/* ── Conversation format (accordion) ───────────────── */}
            {/* Two mutually-exclusive picker lists. The catalog is
                served by /api/chat/conversation-formats so adding a
                new structure or decision-method plugin server-side
                doesn't need a frontend code change. */}
            <SectionHeader
              label="Conversation format"
              open={openSections.conversationFormat}
              onToggle={() => toggleSection('conversationFormat')}
            />
            {openSections.conversationFormat && (
              <ConversationFormatPicker
                catalog={conversationFormats}
                structureId={conversationStructureId}
                onStructureChange={onConversationStructureChange}
                decisionId={decisionMethodId}
                onDecisionChange={onDecisionMethodChange}
              />
            )}

            <div className="dev-panel-divider" />

            {/* ── Response priority (accordion) ──────────────────── */}
            {/* Two mutually-exclusive choices. Under "Prioritize
                conversation speed" the backend also races the chosen
                model against a fast fallback and aggressively
                substitutes failed LLMs (see backend/app/services/
                resilience.py). Under "Prioritize model choice" the
                user's selection is preserved and a failed turn just
                gets noted in chat. */}
            <SectionHeader
              label="Response priority"
              open={openSections.responsePriority}
              onToggle={() => toggleSection('responsePriority')}
            />
            {openSections.responsePriority && (
              <>
                <button
                  className={`dev-panel-choice ${!speedPriority ? 'dev-panel-choice-active' : ''}`}
                  onClick={() => onSpeedPriorityChange?.(false)}
                  title={
                    "Use the participant model you picked, and don't "
                    + "swap models in mid-chat if one is slow or fails."
                  }
                >
                  {!speedPriority
                    ? <CheckSquare size={16} className="dev-check-icon" />
                    : <Square size={16} className="dev-check-icon" />}
                  Prioritize model choice
                </button>
                <button
                  className={`dev-panel-choice ${speedPriority ? 'dev-panel-choice-active' : ''}`}
                  onClick={() => onSpeedPriorityChange?.(true)}
                  title={
                    "Race the chosen model against a fast fallback "
                    + "after 5s, and substitute another LLM behind the "
                    + "persona if the chosen one fails outright."
                  }
                >
                  {speedPriority
                    ? <CheckSquare size={16} className="dev-check-icon" />
                    : <Square size={16} className="dev-check-icon" />}
                  Prioritize conversation speed
                </button>
              </>
            )}

            <div className="dev-panel-divider" />

            {/* ── Display options (accordion) ────────────────────── */}
            <SectionHeader
              label="Display options"
              open={openSections.display}
              onToggle={() => toggleSection('display')}
            />
            {openSections.display && (
              <>
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
              </>
            )}

            <div className="dev-panel-divider" />

            {/* ── View Prompts (accordion) ───────────────────────── */}
            {/* No right-side chevrons on the rows themselves: these
                buttons open a modal and don't expand a sub-panel, so a
                row-level chevron would be misleading. */}
            <SectionHeader
              label="View Prompts"
              open={openSections.transparency}
              onToggle={() => toggleSection('transparency')}
            />
            {openSections.transparency && (
              <>
                <button
                  className="dev-panel-row"
                  disabled={!hasCredentials}
                  onClick={() => { onShowCredentials?.(); setOpen(false); }}
                  title={
                    hasCredentials
                      ? "View the orchestrator's per-participant Credential Summary"
                      : "Credential Summary is built after Phase 1 (initial opinions). Start a chat first."
                  }
                >
                  <ScrollText size={14} className="dev-check-icon" />
                  View Credential Summary…
                </button>
                <button
                  className="dev-panel-row"
                  onClick={() => { onShowPromptCatalog?.(); setOpen(false); }}
                  title="View every prompt template the orchestrator and participants use, grouped by phase."
                >
                  <BookOpen size={14} className="dev-check-icon" />
                  View current chat prompts…
                </button>
              </>
            )}

            <div className="dev-panel-divider" />

            {/* ── Advanced (single item) ─────────────────────────── */}
            <div className="dev-panel-label">Advanced</div>
            <button
              className="dev-panel-row"
              onClick={() => { onShowConversationLimits?.(); setOpen(false); }}
              title="View and adjust the per-phase repetition limits and failsafe pause points."
            >
              <SlidersHorizontal size={14} className="dev-check-icon" />
              Conversation limits…
              {conversationLimitsOverridden && (
                <span
                  title="One or more limits are overridden from the defaults"
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  (custom)
                </span>
              )}
              <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5, flexShrink: 0 }} />
            </button>
          </div>
        )}

        {/* Model picker sub-panel — only meaningful while the Model
            Selection accordion is open, since that's the only section
            whose rows set activeSub. */}
        {open && modelSelOpen && activeSub && (
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

/**
 * Clickable section header for the multi-item categories. Visually
 * matches the existing uppercase `dev-panel-label` style, but is a
 * button with a chevron that flips when the section is open.
 */
function SectionHeader({ label, open, onToggle }) {
  return (
    <button
      type="button"
      className={`dev-panel-section-header ${open ? 'dev-panel-section-header-open' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <span>{label}</span>
      {open
        ? <ChevronDown size={12} className="dev-panel-section-chevron" />
        : <ChevronRight size={12} className="dev-panel-section-chevron" />}
    </button>
  );
}


/**
 * Two stacked radio-style pickers for the conversation structure and
 * decision-making method. Driven entirely by the server catalog so
 * adding a plugin doesn't need a code change here. A null current
 * selection means "follow the backend's default" — we highlight that
 * default but the explicit user choice always wins when set.
 */
function ConversationFormatPicker({
  catalog,
  structureId, onStructureChange,
  decisionId, onDecisionChange,
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
      {structures.map(s => (
        <button
          key={s.id}
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
      {decisions.map(d => (
        <button
          key={d.id}
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
