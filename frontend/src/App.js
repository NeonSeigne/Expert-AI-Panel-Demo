import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Header from './components/Header';
import ParticipantSidebar from './components/ParticipantSidebar';
import ChatControls from './components/ChatControls';
import ChatArea from './components/ChatArea';
import ExpertPersonaModal from './components/ExpertPersonaModal';
import ChatTableView from './components/ChatTableView';
import {
  fetchModels, fetchPersonas, fetchDemoQuestions,
  startChat, continueChat, getOrchestrator, setOrchestrator,
  getSpeedPriority, setSpeedPriority, getAuthStatus,
  exportChat, exportApiLog, fetchTableView, getRateLimitStatus,
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

  // Backend catalog
  const [providers, setProviders] = useState([]);
  const [neonModels, setNeonModels] = useState([]);
  const [catalog, setCatalog] = useState({ neon: [], extra: [] });
  const [demoQuestions, setDemoQuestions] = useState([]);

  // Display options
  const [speedPriority, setSpeedPriorityState] = useState(false);
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

  // Modals
  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const [expertEditing, setExpertEditing] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);

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
    getSpeedPriority().then(d => setSpeedPriorityState(!!d.enabled)).catch(() => {});
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

  const selectedParticipants = useMemo(() => {
    return selectedIds
      .map(id => allCatalogParticipants[id])
      .filter(Boolean);
  }, [selectedIds, allCatalogParticipants]);

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
    try {
      await setSpeedPriority(enabled);
      setSpeedPriorityState(enabled);
    } catch (err) { console.error('Failed to set speed priority:', err); }
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
      if (prev.length >= maxParticipants) return prev;
      setEnabledMap(em => ({ ...em, [id]: true }));
      return [...prev, id];
    });
  }, [maxParticipants]);

  const handleSidebarToggleEnabled = useCallback((participantId, enabled) => {
    setEnabledMap(em => ({ ...em, [participantId]: enabled }));
  }, []);

  const handleSidebarRemove = useCallback((participantId) => {
    setSelectedIds(prev => prev.filter(x => x !== participantId));
    setEnabledMap(em => {
      const next = { ...em };
      delete next[participantId];
      return next;
    });
  }, []);

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

  // ─── Build start payload ────────────────────────────────────────
  const buildStartPayload = useCallback((theQuestion) => {
    const enabledParticipants = selectedParticipants.filter(
      p => enabledMap[p.participant_id] !== false,
    );
    const participants = enabledParticipants.map(p => ({
      participant_id: p.participant_id,
      kind: p.kind || (p.participant_id.startsWith('neon:') ? 'neon'
        : (p.participant_id.startsWith('extra_') ? 'extra' : 'expert')),
      name: p.name,
      role_prompt: p.role_prompt || null,
      model_id_override: modelAssignments[p.participant_id] || null,
    }));
    const expert_payload = enabledParticipants
      .filter(p => (p.kind || '').startsWith('expert'))
      .map(p => ({
        participant_id: p.participant_id,
        name: p.name,
        model_id: modelAssignments[p.participant_id] || p.model_id,
        role_prompt: p.role_prompt,
      }));
    return {
      question: theQuestion,
      participants,
      expert_personas: expert_payload,
      model_assignments: modelAssignments,
      orchestrator_model_id: orchestratorModel,
      summarizer_model_id: summarizerModel,
      max_participants: maxParticipants,
    };
  }, [selectedParticipants, enabledMap, modelAssignments, orchestratorModel, summarizerModel, maxParticipants]);

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
    if (enabledSelectedCount < 2) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setMessages([]);
    setSystemMessages([]);
    setStatusText('Starting conversation...');
    setSessionId(null);
    setSessionParticipants([]);
    setPause(null);

    try {
      await startChat(
        buildStartPayload(theQuestion),
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
          onFailsafePause: (data) => {
            setPause({ reason: 'messages', ...data });
          },
          onOrchestratorCapPause: (data) => {
            setPause({ reason: 'orchestrator', ...data });
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
  }, [buildStartPayload, enabledSelectedCount, dailyLimit]);

  const handleStartRandom = useCallback(() => {
    if (demoQuestions.length === 0) {
      setSystemMessages(prev => [...prev, { text: 'No demo questions available.' }]);
      return;
    }
    const q = pickRandom(demoQuestions);
    handleStart(q.text);
  }, [demoQuestions, handleStart]);

  const startDisabled = isRunning || enabledSelectedCount < 2;
  const startDisabledReason = enabledSelectedCount < 2
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
        />
        <div className="content">
          <ChatControls
            onStartRandom={handleStartRandom}
            onStartTyped={handleStart}
            onStop={handleStop}
            disabled={startDisabled}
            isRunning={isRunning}
            disabledReason={startDisabledReason}
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
    </div>
  );
}
