import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Header from './components/Header';
import ParticipantSidebar from './components/ParticipantSidebar';
import ChatControls from './components/ChatControls';
import ChatArea from './components/ChatArea';
import ExpertPersonaModal from './components/ExpertPersonaModal';
import ChatTableView from './components/ChatTableView';
import CredentialSummaryModal from './components/CredentialSummaryModal';
import ConversationLimitsModal from './components/ConversationLimitsModal';
import PromptCatalogModal from './components/PromptCatalogModal';
import HumanParticipantModal from './components/HumanParticipantModal';
import {
  fetchModels, fetchPersonas, fetchDemoQuestions,
  startChat, continueChat, getOrchestrator, setOrchestrator,
  getSpeedPriority, setSpeedPriority,
  getAuthStatus,
  exportChat, exportApiLog, fetchTableView,   fetchCredentials,
  fetchConversationLimitsDefaults,
  autoSelectParticipants,
  fetchPromptCatalog,
  getRateLimitStatus,
  submitHumanResponse, patchHumanCredential,
} from './utils/api';
import * as storage from './utils/storage';
import './styles/variables.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/ccai.css';

function pickRandom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export default function App() {
  // Persistent state
  const persisted = useMemo(() => storage.loadState(), []);
  const [theme, setTheme] = useState(() => persisted.theme
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  const [expertPersonas, setExpertPersonas] = useState(persisted.expert_personas || []);
  const [selectedIds, setSelectedIds] = useState(persisted.participants_selected || []);
  const [enabledMap, setEnabledMap] = useState(persisted.participants_enabled || {});
  const [modelAssignments, setModelAssignments] = useState(persisted.model_assignments || {});
  const [orchestratorModel, setOrchestratorModelState] = useState(persisted.orchestrator_model_id);
  const [summarizerModel, setSummarizerModelState] = useState(persisted.summarizer_model_id);
  const [maxParticipants, setMaxParticipants] = useState(persisted.max_participants || 5);
  // Response-priority toggle. The backend is the source of truth (so
  // it stays consistent across browsers), but we mirror the value
  // here so the UI doesn't flicker after a settings change.
  // Default false matches the backend default ("Prioritize model choice").
  const [speedPriority, setSpeedPriorityState] = useState(false);

  // Backend catalog
  const [providers, setProviders] = useState([]);
  const [neonModels, setNeonModels] = useState([]);
  const [catalog, setCatalog] = useState({ neon: [], extra: [] });
  const [demoQuestions, setDemoQuestions] = useState([]);

  // Display options
  const [showResponseTime, setShowResponseTime] = useState(false);
  const [showChatStats, setShowChatStats] = useState(false);

  // Auth + rate limit
  const [auth, setAuth] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(30);

  // Conversation state
  const [messages, setMessages] = useState([]);
  const [systemMessages, setSystemMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessionParticipants, setSessionParticipants] = useState([]);
  const [pause, setPause] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState('');

  // Modals
  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const [expertEditing, setExpertEditing] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  // Credential Summary: cached snapshot fed by SSE `credentials_updated`
  // events, plus an open/closed flag and a question echo for the modal
  // header. Reset on each new chat start.
  const [credentialsData, setCredentialsData] = useState(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  // Conversation limits: schema (defaults + bounds + descriptions)
  // pulled from /api/chat/limits/defaults, plus a sparse map of the
  // user's overrides persisted to localStorage. Empty map means
  // "use server defaults". The schema lazy-loads on first open.
  const [limitsSchema, setLimitsSchema] = useState(null);
  const [limitsOverrides, setLimitsOverrides] = useState(
    persisted.conversation_limits || {},
  );
  const [limitsOpen, setLimitsOpen] = useState(false);
  // Auto-select toggle: when on, the participant dropdown defers
  // selection to the orchestrator LLM at /chat/start time. We also
  // snapshot the user's manual selection before turning it on so we
  // can restore it when it's turned back off.
  const [autoSelectMode, setAutoSelectMode] = useState(
    !!persisted.auto_select_mode,
  );
  const [priorManualSelection, setPriorManualSelection] = useState(null);
  // Prompt catalog: lazily fetched on first open, then cached for the
  // rest of the session. The catalog is static per backend deploy.
  const [promptCatalog, setPromptCatalog] = useState(null);
  const [promptCatalogOpen, setPromptCatalogOpen] = useState(false);

  // In-the-loop human participant.
  //   humanParticipant is the persisted spec:
  //     { participant_id, name, credential_summary: {...} } | null
  //   humanModalOpen / humanEditing power the Add/Edit modal.
  //   awaitingHuman holds the payload from the last human_turn_needed
  //     SSE event (null when no human turn is pending).
  //   humanSubmitting blocks the slot's buttons while POST is in flight.
  const [humanParticipant, setHumanParticipant] = useState(
    persisted.human_participant || null,
  );
  const [humanModalOpen, setHumanModalOpen] = useState(false);
  const [humanEditing, setHumanEditing] = useState(null);
  const [awaitingHuman, setAwaitingHuman] = useState(null);
  const [humanSubmitting, setHumanSubmitting] = useState(false);

  const abortRef = useRef(null);

  // ─── Apply theme ────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    storage.setTheme(theme);
  }, [theme]);

  // ─── Load catalogs ──────────────────────────────────────────────
  useEffect(() => {
    fetchModels().then(d => {
      setProviders(d.providers || []);
      setNeonModels(d.neon_models || []);
    }).catch(err => console.error('Failed to load models:', err));
    fetchPersonas().then(setCatalog).catch(err => console.error('Failed to load personas:', err));
    fetchDemoQuestions().then(d => setDemoQuestions(d.questions || []))
      .catch(err => console.error('Failed to load demo questions:', err));
    getOrchestrator().then(d => {
      // Only sync if user hasn't explicitly chosen one (localStorage wins)
      if (!persisted.orchestrator_model_id && d?.model_id) {
        setOrchestratorModelState(d.model_id);
      }
    }).catch(() => {});
    // Hydrate the Response-priority toggle from the backend so the
    // initial render of the Settings menu shows the real server state.
    getSpeedPriority().then(d => {
      if (typeof d?.enabled === 'boolean') setSpeedPriorityState(d.enabled);
    }).catch(() => {});
    getAuthStatus().then(setAuth).catch(() => {});
    getRateLimitStatus().then(d => {
      if (d?.daily_limit) setDailyLimit(d.daily_limit);
    }).catch(() => {});
  }, [persisted.orchestrator_model_id]);

  // ─── Build a flat list of all models for pickers ────────────────
  const allModelsFlat = useMemo(() => {
    const list = [];
    for (const p of providers) {
      for (const m of p.models) {
        list.push({ id: m.id, name: m.name, provider: p.name });
      }
    }
    for (const nm of neonModels) {
      for (const p of (nm.personas || [])) {
        if (p.enabled === false) continue;
        list.push({
          id: `neon:${nm.model_id}:${p.persona_name}`,
          name: p.persona_name,
          provider: `Neon / ${nm.name.split('/').pop()}`,
        });
      }
    }
    return list;
  }, [providers, neonModels]);

  // ─── Active participants resolved from selectedIds ──────────────
  const allCatalogParticipants = useMemo(() => {
    const map = {};
    for (const p of (catalog.neon || [])) map[p.participant_id] = p;
    for (const p of (catalog.extra || [])) map[p.participant_id] = p;
    for (const p of (expertPersonas || [])) map[p.participant_id] = p;
    return map;
  }, [catalog, expertPersonas]);

  // Synthetic catalog entry for the in-the-loop human, so they slot
  // into the same data structures the rest of the app already uses
  // (sidebar, start payload, credentials display).
  const humanCatalogEntry = useMemo(() => {
    if (!humanParticipant) return null;
    return {
      participant_id: humanParticipant.participant_id,
      kind: 'human',
      name: humanParticipant.name,
      role_prompt: '',
      model_id: '',
      default_model_id: '',
      model_display: 'Human participant',
      display_name: 'Human participant',
    };
  }, [humanParticipant]);

  const selectedParticipants = useMemo(() => {
    const fromCatalog = selectedIds
      .map(id => allCatalogParticipants[id])
      .filter(Boolean);
    // The human always appears first in the sidebar / participants list.
    return humanCatalogEntry ? [humanCatalogEntry, ...fromCatalog] : fromCatalog;
  }, [selectedIds, allCatalogParticipants, humanCatalogEntry]);

  const enabledSelectedCount = useMemo(() => {
    return selectedParticipants.filter(p => enabledMap[p.participant_id] !== false).length;
  }, [selectedParticipants, enabledMap]);

  // ─── Persistence ────────────────────────────────────────────────
  useEffect(() => { storage.setExpertPersonas(expertPersonas); }, [expertPersonas]);
  useEffect(() => { storage.setParticipantsSelected(selectedIds); }, [selectedIds]);
  useEffect(() => { storage.setParticipantsEnabled(enabledMap); }, [enabledMap]);
  useEffect(() => { storage.setModelAssignments(modelAssignments); }, [modelAssignments]);
  useEffect(() => { storage.setOrchestratorModelId(orchestratorModel); }, [orchestratorModel]);
  useEffect(() => { storage.setSummarizerModelId(summarizerModel); }, [summarizerModel]);
  useEffect(() => { storage.setMaxParticipants(maxParticipants); }, [maxParticipants]);
  useEffect(() => { storage.setHumanParticipant(humanParticipant); }, [humanParticipant]);

  // ─── Settings handlers ──────────────────────────────────────────
  const handleOrchestratorChange = useCallback(async (modelId) => {
    try {
      await setOrchestrator(modelId || '');
      setOrchestratorModelState(modelId || null);
    } catch (err) {
      console.error('Failed to set orchestrator:', err);
    }
  }, []);
  const handleSummarizerChange = useCallback((modelId) => {
    setSummarizerModelState(modelId || null);
  }, []);
  const handleSpeedPriorityChange = useCallback(async (enabled) => {
    // Optimistic update; revert on backend error so the UI never
    // claims a setting the server didn't actually accept.
    setSpeedPriorityState(enabled);
    try {
      const d = await setSpeedPriority(enabled);
      if (typeof d?.enabled === 'boolean') setSpeedPriorityState(d.enabled);
    } catch (err) {
      console.error('Failed to set speed priority:', err);
      setSpeedPriorityState(!enabled);
    }
  }, []);
  const handleMaxParticipantsChange = useCallback((n) => {
    const clamped = Math.max(3, Math.min(9, n));
    setMaxParticipants(clamped);
    if (selectedIds.length > clamped) {
      setSelectedIds(prev => prev.slice(0, clamped));
    }
  }, [selectedIds]);
  const handleModelAssignmentChange = useCallback((participantId, modelId) => {
    setModelAssignments(prev => {
      const next = { ...prev };
      if (modelId) next[participantId] = modelId;
      else delete next[participantId];
      return next;
    });
  }, []);

  // ─── Participant ops ────────────────────────────────────────────
  const handleToggleParticipant = useCallback((participant, kind) => {
    const id = participant.participant_id;
    // The human occupies one of the maxParticipants slots; reserve it
    // when computing the room left for LLM picks.
    const humanReserved = humanParticipant ? 1 : 0;
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        // Deselect entirely
        setEnabledMap(em => {
          const next = { ...em };
          delete next[id];
          return next;
        });
        return prev.filter(x => x !== id);
      }
      if (prev.length + humanReserved >= maxParticipants) return prev;
      setEnabledMap(em => ({ ...em, [id]: true }));
      return [...prev, id];
    });
  }, [maxParticipants, humanParticipant]);

  const handleSidebarToggleEnabled = useCallback((participantId, enabled) => {
    setEnabledMap(em => ({ ...em, [participantId]: enabled }));
  }, []);

  const handleSidebarRemove = useCallback((participantId) => {
    if (humanParticipant && participantId === humanParticipant.participant_id) {
      setHumanParticipant(null);
      return;
    }
    setSelectedIds(prev => prev.filter(x => x !== participantId));
    setEnabledMap(em => {
      const next = { ...em };
      delete next[participantId];
      return next;
    });
  }, [humanParticipant]);

  // ─── Human participant ops ───────────────────────────────────────
  const handleOpenHumanModal = useCallback(() => {
    setHumanEditing(humanParticipant);
    setHumanModalOpen(true);
  }, [humanParticipant]);

  const handleSaveHuman = useCallback((spec) => {
    setHumanParticipant(spec);
    setHumanModalOpen(false);
    setHumanEditing(null);
  }, []);

  const handleRemoveHuman = useCallback(() => {
    setHumanParticipant(null);
    setHumanModalOpen(false);
    setHumanEditing(null);
  }, []);

  const handleHumanSubmit = useCallback(async (text) => {
    if (!sessionId || !awaitingHuman) return;
    setHumanSubmitting(true);
    try {
      await submitHumanResponse(sessionId, { text });
    } catch (err) {
      console.error('Human response failed:', err);
      setSystemMessages(prev => [...prev, {
        text: `Couldn't send your message: ${err.message}`,
      }]);
    } finally {
      setHumanSubmitting(false);
    }
  }, [sessionId, awaitingHuman]);

  const handleHumanSkip = useCallback(async () => {
    if (!sessionId || !awaitingHuman) return;
    setHumanSubmitting(true);
    try {
      await submitHumanResponse(sessionId, { text: '', skip: true });
    } catch (err) {
      console.error('Human skip failed:', err);
    } finally {
      setHumanSubmitting(false);
    }
  }, [sessionId, awaitingHuman]);

  const handleEditHumanCredential = useCallback(async (patch) => {
    if (!sessionId) return;
    try {
      const result = await patchHumanCredential(sessionId, patch);
      const updated = result.credential;
      if (updated) {
        // Reflect the edit in the persisted spec so re-opens of the
        // Add-a-Human modal show the latest version.
        setHumanParticipant(prev => prev ? {
          ...prev,
          name: updated.name || prev.name,
          credential_summary: {
            name: updated.name || prev.name,
            expertise: updated.expertise || '',
            personality: updated.personality || '',
            credibility_for_question: updated.credibility_for_question ?? 0.55,
            bias_to_watch: updated.bias_to_watch || '',
          },
        } : prev);
        // Refresh the credentials cache so the modal reflects the edit.
        const data = await fetchCredentials(sessionId);
        setCredentialsData(data);
      }
    } catch (err) {
      console.error('Edit human credential failed:', err);
    }
  }, [sessionId]);

  // ─── Auto-select toggle ─────────────────────────────────────────
  // When turning ON, snapshot the current manual selection so we can
  // restore it on OFF. The actual LLM ranking happens in handleStart
  // (so the user's question is available); this just flips the mode.
  const handleToggleAutoSelectMode = useCallback((on) => {
    if (on && !autoSelectMode) {
      setPriorManualSelection([...selectedIds]);
    } else if (!on && autoSelectMode && priorManualSelection !== null) {
      setSelectedIds(priorManualSelection);
      setPriorManualSelection(null);
    }
    setAutoSelectMode(!!on);
    storage.setAutoSelectMode(!!on);
  }, [autoSelectMode, selectedIds, priorManualSelection]);

  // ─── Expert persona ops ─────────────────────────────────────────
  const handleOpenExpertModal = useCallback((personaOrNull) => {
    setExpertEditing(personaOrNull);
    setExpertModalOpen(true);
  }, []);
  const handleSaveExpert = useCallback((persona) => {
    setExpertPersonas(prev => {
      const idx = prev.findIndex(p => p.participant_id === persona.participant_id);
      if (idx === -1) return [...prev, persona];
      const next = [...prev];
      next[idx] = persona;
      return next;
    });
    setExpertModalOpen(false);
    setExpertEditing(null);
  }, []);
  const handleDeleteExpert = useCallback((id) => {
    setExpertPersonas(prev => prev.filter(p => p.participant_id !== id));
    setSelectedIds(prev => prev.filter(x => x !== id));
    setEnabledMap(em => { const n = { ...em }; delete n[id]; return n; });
    setExpertModalOpen(false);
    setExpertEditing(null);
  }, []);

  // ─── Downloads ──────────────────────────────────────────────────
  const downloadFile = useCallback((filename, content, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  const handleDownloadTxt = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportChat(sessionId, 'txt');
      downloadFile(r.filename, r.content);
    } catch (err) { console.error('Export failed:', err); }
  }, [sessionId, downloadFile]);
  const handleDownloadMd = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportChat(sessionId, 'md');
      downloadFile(r.filename, r.content);
    } catch (err) { console.error('Export failed:', err); }
  }, [sessionId, downloadFile]);
  const handleDownloadCsvTable = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportChat(sessionId, 'csv-table');
      downloadFile(r.filename, r.content, 'text/csv;charset=utf-8');
    } catch (err) { console.error('CSV export failed:', err); }
  }, [sessionId, downloadFile]);
  const handleDownloadApiLog = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportApiLog(sessionId);
      downloadFile('api_log.json', JSON.stringify(r, null, 2), 'application/json');
    } catch (err) { console.error('API log export failed:', err); }
  }, [sessionId, downloadFile]);

  // ─── Table view ─────────────────────────────────────────────────
  const handleShowTableView = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await fetchTableView(sessionId);
      setTableData(data);
      setTableOpen(true);
    } catch (err) { console.error('Table fetch failed:', err); }
  }, [sessionId]);

  // ─── Credential Summary view ────────────────────────────────────
  // Always re-fetch on open so the modal reflects the very latest
  // server-side state (the Phase-3 refresh may have run after the SSE
  // event was missed by a stale tab).
  const handleShowCredentials = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await fetchCredentials(sessionId);
      setCredentialsData(data);
      setCredentialsOpen(true);
    } catch (err) { console.error('Credentials fetch failed:', err); }
  }, [sessionId]);

  const handleRefreshCredentials = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await fetchCredentials(sessionId);
      setCredentialsData(data);
    } catch (err) { console.error('Credentials refresh failed:', err); }
  }, [sessionId]);

  // ─── Conversation limits (settings) ────────────────────────────
  // Lazy-load the schema on first open, then cache it for the rest
  // of the session. The user's override map is already in state
  // and persisted to localStorage; we hand it to the modal as the
  // initial draft and re-persist on every change.
  const handleShowConversationLimits = useCallback(async () => {
    if (!limitsSchema) {
      try {
        const data = await fetchConversationLimitsDefaults();
        setLimitsSchema(data);
      } catch (err) {
        console.error('Conversation-limit schema fetch failed:', err);
        return;
      }
    }
    setLimitsOpen(true);
  }, [limitsSchema]);

  const handleConversationLimitsChange = useCallback((next) => {
    setLimitsOverrides(next);
    storage.setConversationLimits(next);
  }, []);

  const handleConversationLimitsResetAll = useCallback(() => {
    setLimitsOverrides({});
    storage.setConversationLimits({});
  }, []);

  // ─── Prompt catalog (Transparency) ─────────────────────────────
  const handleShowPromptCatalog = useCallback(async () => {
    if (!promptCatalog) {
      try {
        const data = await fetchPromptCatalog();
        setPromptCatalog(data);
      } catch (err) {
        console.error('Prompt catalog fetch failed:', err);
        return;
      }
    }
    setPromptCatalogOpen(true);
  }, [promptCatalog]);

  // ─── Build start payload ────────────────────────────────────────
  // `participantsOverride`, if provided, replaces the
  // selectedParticipants-derived list (used by the auto-select flow
  // because the freshly-chosen list isn't in state yet when we need it).
  const buildStartPayload = useCallback((theQuestion, participantsOverride) => {
    const baseList = participantsOverride
      ?? selectedParticipants.filter(p => enabledMap[p.participant_id] !== false);
    const participants = baseList.map(p => ({
      participant_id: p.participant_id,
      kind: p.kind || (p.participant_id.startsWith('neon:') ? 'neon'
        : (p.participant_id.startsWith('extra_') ? 'extra' : 'expert')),
      name: p.name,
      role_prompt: p.kind === 'human' ? null : (p.role_prompt || null),
      model_id_override: p.kind === 'human'
        ? null
        : (modelAssignments[p.participant_id] || null),
    }));
    const expert_payload = baseList
      .filter(p => (p.kind || '').startsWith('expert'))
      .map(p => ({
        participant_id: p.participant_id,
        name: p.name,
        model_id: modelAssignments[p.participant_id] || p.model_id,
        role_prompt: p.role_prompt,
      }));
    // The human's pre-authored credential summary rides alongside the
    // participants array. Backend rejects start if it sees a human in
    // participants but no human_credential, so this MUST be present
    // whenever the human is enabled.
    const humanInList = baseList.find(p => p.kind === 'human');
    let human_credential = null;
    if (humanInList && humanParticipant) {
      const cs = humanParticipant.credential_summary || {};
      human_credential = {
        participant_id: humanInList.participant_id,
        name: humanInList.name,
        expertise: cs.expertise || '',
        personality: cs.personality || '',
        credibility_for_question: typeof cs.credibility_for_question === 'number'
          ? cs.credibility_for_question
          : 0.55,
        bias_to_watch: cs.bias_to_watch || '',
      };
    }
    return {
      question: theQuestion,
      participants,
      expert_personas: expert_payload,
      model_assignments: modelAssignments,
      orchestrator_model_id: orchestratorModel,
      summarizer_model_id: summarizerModel,
      max_participants: maxParticipants,
      // Sparse override map; backend clamps and falls back per-field.
      limits: limitsOverrides,
      human_credential,
    };
  }, [selectedParticipants, enabledMap, modelAssignments, orchestratorModel, summarizerModel, maxParticipants, limitsOverrides, humanParticipant]);

  // ─── Stop / continue ────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setIsRunning(false);
    setStatusText('');
    setPause(null);
    setSystemMessages(prev => [...prev, { text: 'Chat stopped by user.' }]);
  }, []);
  const handleContinuePause = useCallback(async (reason) => {
    if (!sessionId) return;
    try {
      await continueChat(sessionId, reason);
      setPause(null);
    } catch (err) { console.error('Continue failed:', err); }
  }, [sessionId]);

  // ─── Start chat ─────────────────────────────────────────────────
  const handleStart = useCallback(async (theQuestion) => {
    if (!theQuestion || !theQuestion.trim()) return;
    // In auto-select mode the dropdown has no manual picks - skip the
    // pre-flight count check and validate the chosen pool below instead.
    if (!autoSelectMode && enabledSelectedCount < 2) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setMessages([]);
    setSystemMessages([]);
    setStatusText(
      autoSelectMode ? 'Picking participants...' : 'Starting conversation...',
    );
    setSessionId(null);
    setSessionParticipants([]);
    setPause(null);
    setActiveQuestion(theQuestion.trim());
    setCredentialsData(null);
    setAwaitingHuman(null);

    // Resolve the final participant list. When auto-select is on, ask
    // the orchestrator to rank every available candidate; otherwise
    // fall through to the user's manual selection.
    let resolvedParticipants = null;
    if (autoSelectMode) {
      const candidatePool = Object.values(allCatalogParticipants);
      if (candidatePool.length < 2) {
        setIsRunning(false);
        setStatusText('');
        setSystemMessages(prev => [...prev, {
          text: 'Auto-select needs at least 2 candidate participants available.',
        }]);
        return;
      }
      const candidatesPayload = candidatePool.map(p => ({
        participant_id: p.participant_id,
        name: p.name,
        role_prompt: p.role_prompt || '',
        kind: p.kind || (p.participant_id.startsWith('neon:') ? 'neon'
          : (p.participant_id.startsWith('extra_') ? 'extra' : 'expert')),
        model_id: modelAssignments[p.participant_id]
          || p.model_id || p.default_model_id || '',
      }));
      try {
        // The human, if any, always gets a seat; ask the orchestrator
        // for one fewer LLM pick so the total stays at maxParticipants.
        const humanReserved = humanParticipant ? 1 : 0;
        const llmTarget = Math.max(2, maxParticipants - humanReserved);
        const result = await autoSelectParticipants({
          question: theQuestion.trim(),
          count: llmTarget,
          candidates: candidatesPayload,
          orchestrator_model_id: orchestratorModel,
        });
        const chosenIds = result.selected || [];
        const chosenLlms = chosenIds
          .map(id => allCatalogParticipants[id])
          .filter(Boolean);
        resolvedParticipants = humanCatalogEntry
          ? [humanCatalogEntry, ...chosenLlms]
          : chosenLlms;
        if (resolvedParticipants.length < 2) {
          setIsRunning(false);
          setStatusText('');
          setSystemMessages(prev => [...prev, {
            text: 'Auto-select returned too few participants. '
              + 'Turn auto-select off and pick manually.',
          }]);
          return;
        }
        // Reflect the pick in the sidebar.
        setSelectedIds(chosenIds);
        setEnabledMap(prev => {
          const next = { ...prev };
          for (const id of chosenIds) next[id] = true;
          return next;
        });
        if (result.rationale) {
          setSystemMessages(prev => [...prev, {
            text: `Auto-select rationale: ${result.rationale}`,
          }]);
        }
        setStatusText('Starting conversation...');
      } catch (err) {
        console.error('Auto-select failed:', err);
        setIsRunning(false);
        setStatusText('');
        setSystemMessages(prev => [...prev, {
          text: `Auto-select failed: ${err.message}`,
        }]);
        return;
      }
    }

    try {
      await startChat(
        buildStartPayload(theQuestion, resolvedParticipants),
        {
          onSession: (data) => {
            setSessionId(data.session_id);
            setSessionParticipants(data.participants || []);
          },
          onMessage: (data) => {
            setMessages(prev => [...prev, data]);
            setStatusText('Conversation in progress...');
          },
          onOrchestrator: (data) => {
            // Orchestrator events with kind == "status" but no text are
            // status banners; bubble them into a message-style entry so
            // they render with the orchestrator pill.
            if (data && data.text) {
              setMessages(prev => [...prev, { ...data, role: 'orchestrator' }]);
            } else if (data?.message) {
              setStatusText(data.message);
            }
          },
          onStatus: (data) => setStatusText(data.message || ''),
          onSystem: (data) => {
            setSystemMessages(prev => [...prev, data]);
            if (data.text === 'End of Chat') {
              setStatusText('');
            }
          },
          onError: (data) => {
            setStatusText('');
            setSystemMessages(prev => [...prev, { text: `Error: ${data.message}` }]);
          },
          onParticipantError: (data) => {
            setSystemMessages(prev => [...prev, {
              text: `${data.name || 'A participant'} couldn't respond this turn.`,
            }]);
          },
          onParticipantSubstituted: (data) => {
            // Resilience layer swapped the backing LLM behind a
            // persona's prompt+name. Surface it as a system note so
            // the user can reconcile any change in voice / latency
            // with the chat metadata.
            const name = data.name || 'A participant';
            const toDisplay = data.to_model_display || data.to_model_id || 'a substitute model';
            setSystemMessages(prev => [...prev, {
              text: `${name}'s primary model didn't respond; continuing with ${toDisplay}.`,
            }]);
          },
          onParticipantReplaced: (data) => {
            // Phase 1 alternate kicked in. Replace the session
            // roster snapshot so the sidebar re-renders with the
            // new participant; also note the change in chat.
            if (Array.isArray(data?.roster)) {
              setSessionParticipants(data.roster);
            }
            const origName = data.original_name || 'A participant';
            const altName = data.new_name || 'an alternate';
            setSystemMessages(prev => [...prev, {
              text: `${origName} couldn't give an initial opinion; ${altName} is taking their place.`,
            }]);
          },
          onFailsafePause: (data) => {
            setPause({ reason: 'messages', ...data });
          },
          onOrchestratorCapPause: (data) => {
            setPause({ reason: 'orchestrator', ...data });
          },
          onCredentialsUpdated: (data) => {
            // Backend emits this after the Phase-1.5 build and (when
            // it changes) after the Phase-3 refresh. We cache the
            // payload so the modal opens instantly without a round trip.
            setCredentialsData({
              session_id: data.session_id,
              question: theQuestion.trim(),
              credentials: data.credentials || [],
              stage: data.stage || 'built',
            });
          },
          onHumanTurnNeeded: (data) => {
            // Orchestrator is paused waiting on the human; render the
            // green-bordered input slot and the lower-screen indicator.
            setAwaitingHuman(data || null);
            setStatusText(
              `${data?.speaker_name || 'Human'} is up next.`,
            );
          },
          onHumanTurnCleared: () => {
            setAwaitingHuman(null);
            setHumanSubmitting(false);
          },
          onDone: () => {
            setIsRunning(false);
            setStatusText('');
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Chat error:', err);
      const isRateLimit = err.message && err.message.includes('Daily conversation limit');
      setSystemMessages(prev => [...prev, {
        text: isRateLimit
          ? `Daily conversation limit reached (${dailyLimit}/day). Sign in with HuggingFace for unlimited access.`
          : `Error: ${err.message}`,
      }]);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      getAuthStatus().then(setAuth).catch(() => {});
    }
  }, [
    buildStartPayload, enabledSelectedCount, dailyLimit,
    autoSelectMode, allCatalogParticipants, modelAssignments,
    maxParticipants, orchestratorModel,
    humanParticipant, humanCatalogEntry,
  ]);

  const handleStartRandom = useCallback(() => {
    if (demoQuestions.length === 0) {
      setSystemMessages(prev => [...prev, { text: 'No demo questions available.' }]);
      return;
    }
    const q = pickRandom(demoQuestions);
    handleStart(q.text);
  }, [demoQuestions, handleStart]);

  // In auto-select mode we don't require manual picks - the orchestrator
  // will choose them at /chat/start time, so just need 2+ candidates
  // available in the catalog.
  const autoSelectReady = autoSelectMode
    && Object.keys(allCatalogParticipants).length >= 2;
  const startDisabled = isRunning
    || (!autoSelectMode && enabledSelectedCount < 2)
    || (autoSelectMode && !autoSelectReady);
  const startDisabledReason = autoSelectMode
    ? (!autoSelectReady ? 'No candidate participants available for auto-select.' : '')
    : enabledSelectedCount < 2
    ? 'Add at least 2 active participants to start.'
    : '';

  return (
    <div className="app">
      <Header
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        auth={auth}
        dailyLimit={dailyLimit}
        catalog={catalog}
        expertPersonas={expertPersonas}
        selectedIds={selectedIds}
        maxParticipants={maxParticipants}
        onToggleParticipant={handleToggleParticipant}
        onOpenExpertModal={handleOpenExpertModal}
        autoSelectMode={autoSelectMode}
        onToggleAutoSelectMode={handleToggleAutoSelectMode}
        humanParticipant={humanParticipant}
        onOpenHumanModal={handleOpenHumanModal}

        allModels={allModelsFlat}
        orchestratorModel={orchestratorModel}
        onOrchestratorChange={handleOrchestratorChange}
        summarizerModel={summarizerModel}
        onSummarizerChange={handleSummarizerChange}
        speedPriority={speedPriority}
        onSpeedPriorityChange={handleSpeedPriorityChange}
        showResponseTime={showResponseTime}
        onShowResponseTimeChange={setShowResponseTime}
        showChatStats={showChatStats}
        onShowChatStatsChange={setShowChatStats}
        onMaxParticipantsChange={handleMaxParticipantsChange}
        participants={selectedParticipants}
        modelAssignments={modelAssignments}
        onModelAssignmentChange={handleModelAssignmentChange}
        onShowTableView={handleShowTableView}
        onShowCredentials={handleShowCredentials}
        hasCredentials={!!sessionId}
        onShowPromptCatalog={handleShowPromptCatalog}
        onShowConversationLimits={handleShowConversationLimits}
        conversationLimitsOverridden={Object.keys(limitsOverrides).length > 0}
        onDownloadChatTxt={handleDownloadTxt}
        onDownloadChatMd={handleDownloadMd}
        onDownloadCsvTable={handleDownloadCsvTable}
        onDownloadApiLog={handleDownloadApiLog}
        hasApiLog={!!sessionId}
        hasChat={messages.length > 0}
      />

      <main className="app-main">
        <ParticipantSidebar
          participants={selectedParticipants}
          enabledMap={enabledMap}
          modelAssignments={modelAssignments}
          onToggleEnabled={handleSidebarToggleEnabled}
          onRemove={handleSidebarRemove}
          autoSelectMode={autoSelectMode}
          maxParticipants={maxParticipants}
        />
        <div className="content">
          <ChatControls
            onStartRandom={handleStartRandom}
            onStartTyped={handleStart}
            onStop={handleStop}
            disabled={startDisabled}
            isRunning={isRunning}
            disabledReason={startDisabledReason}
            activeQuestion={activeQuestion}
          />
          <ChatArea
            messages={messages}
            systemMessages={systemMessages}
            isRunning={isRunning}
            statusText={statusText}
            pause={pause}
            onContinuePause={handleContinuePause}
            participants={sessionParticipants.length > 0 ? sessionParticipants : selectedParticipants}
            showResponseTime={showResponseTime}
            showChatStats={showChatStats}
            awaitingHuman={awaitingHuman}
            humanSubmitting={humanSubmitting}
            onHumanSubmit={handleHumanSubmit}
            onHumanSkip={handleHumanSkip}
            onShowTableView={handleShowTableView}
            onDownloadChatTxt={handleDownloadTxt}
            onDownloadChatMd={handleDownloadMd}
            onDownloadCsvTable={handleDownloadCsvTable}
            onDownloadApiLog={handleDownloadApiLog}
            hasApiLog={!!sessionId}
          />
        </div>
      </main>
      <footer className="app-footer">
        Copyright Neon.ai. All rights reserved.{' '}
        <a href="https://www.neon.ai/contact" target="_blank" rel="noopener noreferrer">Patents and licensing</a>
      </footer>

      <ExpertPersonaModal
        isOpen={expertModalOpen}
        initial={expertEditing}
        onClose={() => { setExpertModalOpen(false); setExpertEditing(null); }}
        onSave={handleSaveExpert}
        onDelete={handleDeleteExpert}
        allModels={allModelsFlat}
        defaultModelId={orchestratorModel || ''}
      />
      {tableOpen && (
        <ChatTableView
          data={tableData}
          onClose={() => setTableOpen(false)}
          onExportCsv={handleDownloadCsvTable}
        />
      )}
      <CredentialSummaryModal
        isOpen={credentialsOpen}
        data={credentialsData}
        onClose={() => setCredentialsOpen(false)}
        onRefresh={handleRefreshCredentials}
        humanParticipantId={humanParticipant?.participant_id || null}
        onEditHumanCredential={handleEditHumanCredential}
      />
      <HumanParticipantModal
        isOpen={humanModalOpen}
        initial={humanEditing}
        question={activeQuestion}
        orchestratorModel={orchestratorModel}
        onClose={() => { setHumanModalOpen(false); setHumanEditing(null); }}
        onSave={handleSaveHuman}
        onRemove={humanEditing ? handleRemoveHuman : null}
      />
      <ConversationLimitsModal
        isOpen={limitsOpen}
        schema={limitsSchema}
        overrides={limitsOverrides}
        onClose={() => setLimitsOpen(false)}
        onChange={handleConversationLimitsChange}
        onResetAll={handleConversationLimitsResetAll}
      />
      <PromptCatalogModal
        isOpen={promptCatalogOpen}
        catalog={promptCatalog}
        onClose={() => setPromptCatalogOpen(false)}
      />
    </div>
  );
}
