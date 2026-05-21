import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronRight, Download, Settings2, Search, Sun, Moon,
  Square, CheckSquare, UserPlus, ScrollText, SlidersHorizontal,
  BookOpen,
} from 'lucide-react';

/**
 * Settings menu (gear-icon dropdown in the header).
 *
 * Layout, top-to-bottom, all category items indented under the small
 * uppercase label that introduces them:
 *   - Theme               (Sun / Moon toggle)
 *   - Models              (Orchestrator / Summarizer — stacked rows
 *                          with the currently-chosen model name on a
 *                          second line, ellipsis-truncated)
 *   - Max participants    (- / value / + stepper, 3-9)
 *   - Participants        (Create Expert Persona…, then per-participant
 *                          rows in the same stacked-row style)
 *   - Display options     (toggles)
 *   - Transparency        (Credential Summary, Prompt Catalog — no
 *                          right-side chevrons; just the labelled
 *                          buttons)
 *   - Advanced            (Conversation limits…)
 *   - Downloads           (chat .txt / .md / summary .csv — same items
 *                          are also reachable from the header
 *                          DownloadMenu; the "Full API history" item
 *                          is *only* in DownloadMenu)
 *
 * The header download strip that used to live in this component has
 * moved into a sibling DownloadMenu component, so this file no longer
 * renders any header-bar buttons; just the gear and its panel.
 */
export default function DevMenu({
  theme,
  onToggleTheme,
  allModels,
  orchestratorModel,
  onOrchestratorChange,
  summarizerModel,
  onSummarizerChange,
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
  onShowCredentials,
  hasCredentials,
  onShowPromptCatalog,
  onShowConversationLimits,
  conversationLimitsOverridden,
  onDownloadChatTxt,
  onDownloadChatMd,
  onDownloadCsvTable,
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

  // #region agent log
  useEffect(() => {
    if (!open) return;
    fetch('http://127.0.0.1:7660/ingest/b27d4bb5-c1ab-4767-aa98-1cdf1e8fb0ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '896623' },
      body: JSON.stringify({
        sessionId: '896623',
        runId: 'maxparticipants-repro',
        hypothesisId: 'H1',
        location: 'DevMenu.js:render',
        message: 'DevMenu render snapshot (panel open)',
        data: {
          maxParticipants,
          maxParticipantsType: typeof maxParticipants,
          onMaxParticipantsChangeType: typeof onMaxParticipantsChange,
          ge9: maxParticipants >= 9,
          le3: maxParticipants <= 3,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [open, maxParticipants, onMaxParticipantsChange]);
  // #endregion

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

            {/* ── Theme ─────────────────────────────────────────── */}
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

            {/* ── Models ────────────────────────────────────────── */}
            <div className="dev-panel-label">Models</div>
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

            <div className="dev-panel-divider" />

            {/* ── Max participants ──────────────────────────────── */}
            <div className="dev-panel-label">Max participants ({maxParticipants})</div>
            <div className="ccai-stepper-row">
              <button
                className="btn-sm btn-outline ccai-stepper-btn"
                disabled={maxParticipants <= 3}
                onClick={() => {
                  const next = Math.max(3, maxParticipants - 1);
                  // #region agent log
                  fetch('http://127.0.0.1:7660/ingest/b27d4bb5-c1ab-4767-aa98-1cdf1e8fb0ae', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '896623' },
                    body: JSON.stringify({
                      sessionId: '896623',
                      runId: 'maxparticipants-repro',
                      hypothesisId: 'H1',
                      location: 'DevMenu.js:onMinusClick',
                      message: 'Minus button clicked',
                      data: {
                        maxParticipants,
                        maxParticipantsType: typeof maxParticipants,
                        next,
                        nextType: typeof next,
                        nextIsNaN: Number.isNaN(next),
                        onMaxParticipantsChangeType: typeof onMaxParticipantsChange,
                      },
                      timestamp: Date.now(),
                    }),
                  }).catch(() => {});
                  // #endregion
                  onMaxParticipantsChange(next);
                }}
              >−</button>
              <div className="ccai-stepper-val">{maxParticipants}</div>
              <button
                className="btn-sm btn-outline ccai-stepper-btn"
                disabled={maxParticipants >= 9}
                onClick={() => {
                  const next = Math.min(9, maxParticipants + 1);
                  // #region agent log
                  fetch('http://127.0.0.1:7660/ingest/b27d4bb5-c1ab-4767-aa98-1cdf1e8fb0ae', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '896623' },
                    body: JSON.stringify({
                      sessionId: '896623',
                      runId: 'maxparticipants-repro',
                      hypothesisId: 'H1',
                      location: 'DevMenu.js:onPlusClick',
                      message: 'Plus button clicked',
                      data: {
                        maxParticipants,
                        maxParticipantsType: typeof maxParticipants,
                        next,
                        nextType: typeof next,
                        nextIsNaN: Number.isNaN(next),
                        onMaxParticipantsChangeType: typeof onMaxParticipantsChange,
                      },
                      timestamp: Date.now(),
                    }),
                  }).catch(() => {});
                  // #endregion
                  onMaxParticipantsChange(next);
                }}
              >+</button>
              <span className="dev-panel-hint">3-9</span>
            </div>

            <div className="dev-panel-divider" />

            {/* ── Participants ──────────────────────────────────── */}
            <div className="dev-panel-label">Participants</div>
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

            <div className="dev-panel-divider" />

            {/* ── Display options ───────────────────────────────── */}
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

            {/* ── Transparency ──────────────────────────────────── */}
            {/* No right-side chevrons here: these buttons trigger a
                modal and don't expand a sub-panel, so the chevron the
                old layout had was misleading and (per user feedback)
                wrapped onto a noisy second line. */}
            <div className="dev-panel-label">Transparency</div>
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

            <div className="dev-panel-divider" />

            {/* ── Advanced ──────────────────────────────────────── */}
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

            <div className="dev-panel-divider" />

            {/* ── Downloads ─────────────────────────────────────── */}
            {/* These three are intentional duplicates of items in the
                header DownloadMenu. The "Full API history" item lives
                only in DownloadMenu (per UX request) and is therefore
                not listed here. */}
            <div className="dev-panel-label">Downloads</div>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={() => { onDownloadChatTxt(); setOpen(false); }}
            >
              <Download size={14} className="dev-check-icon" />
              Chat as .txt
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={() => { onDownloadChatMd(); setOpen(false); }}
            >
              <Download size={14} className="dev-check-icon" />
              Chat as .md
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={() => { onDownloadCsvTable(); setOpen(false); }}
            >
              <Download size={14} className="dev-check-icon" />
              Summary table as .csv
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
