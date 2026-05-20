import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sun, Moon } from 'lucide-react';
import LLMSelector from './components/LLMSelector';
import PersonaAccordion from './components/PersonaAccordion';
import ChatControls from './components/ChatControls';
import ChatArea from './components/ChatArea';
import DevMenu from './components/DevMenu';
import AuthBadge from './components/AuthBadge';
import { fetchModels, generateRole, generateRoleFreeform, startChat, getOrchestrator, setOrchestrator, getSpeedPriority, setSpeedPriority, exportChat, exportApiLog, getAuthStatus } from './utils/api';
import './styles/variables.css';
import './styles/layout.css';
import './styles/components.css';

const EMPTY_PERSONA = { name: '', profile: '', identity: '', samples: '' };

function getDisplayName(modelId, providers, neonModels) {
  if (!modelId) return '';
  if (modelId.startsWith('neon:')) {
    return modelId.split(':')[2] || modelId;
  }
  for (const p of (providers || [])) {
    for (const m of p.models) {
      if (m.id === modelId) return m.name;
    }
  }
  return modelId;
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const [providers, setProviders] = useState([]);
  const [neonModels, setNeonModels] = useState([]);
  const [selections, setSelections] = useState([]);
  const [personaA, setPersonaA] = useState({ ...EMPTY_PERSONA });
  const [personaB, setPersonaB] = useState({ ...EMPTY_PERSONA });
  const [accordionOpen, setAccordionOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [systemMessages, setSystemMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [chatFinished, setChatFinished] = useState(false);
  const [orchestratorModel, setOrchestratorModel] = useState('');
  const [personaMode, setPersonaMode] = useState('freeform');
  const [roleStyle, setRoleStyle] = useState('ai_completed');
  const [speedPriority, setSpeedPriorityState] = useState(false);
  const [auth, setAuth] = useState(null);
  const [showResponseTime, setShowResponseTime] = useState(false);
  const [showChatStats, setShowChatStats] = useState(false);
  const [rolePrompts, setRolePrompts] = useState(null);
  const [rolePromptsOpen, setRolePromptsOpen] = useState(false);
  const abortRef = useRef(null);
  const lastRoleConfigRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);



  useEffect(() => {
    fetchModels()
      .then(data => {
        setProviders(data.providers || []);
        setNeonModels(data.neon_models || []);
      })
      .catch(err => console.error('Failed to load models:', err));
    getOrchestrator()
      .then(data => setOrchestratorModel(data.model_id || ''))
      .catch(() => {});
    getSpeedPriority()
      .then(data => setSpeedPriorityState(!!data.enabled))
      .catch(() => {});
    getAuthStatus().then(setAuth).catch(() => {});
  }, []);

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

  const handleOrchestratorChange = useCallback(async (modelId) => {
    try {
      await setOrchestrator(modelId || '');
      setOrchestratorModel(modelId || '');
    } catch (err) {
      console.error('Failed to set orchestrator:', err);
    }
  }, []);

  const handlePersonaModeChange = useCallback((mode) => {
    setPersonaMode(mode);
    setRoleStyle(mode === 'freeform' ? 'ai_completed' : 'exact');
  }, []);

  const handleSpeedPriorityChange = useCallback(async (enabled) => {
    try {
      await setSpeedPriority(enabled);
      setSpeedPriorityState(enabled);
    } catch (err) {
      console.error('Failed to set speed priority:', err);
    }
  }, []);

  const downloadFile = useCallback((filename, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
      const result = await exportChat(sessionId, 'txt');
      downloadFile(result.filename, result.content);
    } catch (err) { console.error('Export failed:', err); }
  }, [sessionId, downloadFile]);

  const handleDownloadMd = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await exportChat(sessionId, 'md');
      downloadFile(result.filename, result.content);
    } catch (err) { console.error('Export failed:', err); }
  }, [sessionId, downloadFile]);

  const handleDownloadApiLog = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await exportApiLog(sessionId);
      downloadFile('api_log.json', JSON.stringify(result, null, 2));
    } catch (err) { console.error('API log export failed:', err); }
  }, [sessionId, downloadFile]);

  const selectedNameA = selections[0] ? getDisplayName(selections[0], providers, neonModels) : '';
  const selectedNameB = selections[1] ? getDisplayName(selections[1], providers, neonModels) : '';

  const canStart = selections.length === 2 && !isRunning;

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsRunning(false);
    setChatFinished(true);
    setStatusText('');
    setSystemMessages(prev => [...prev, { text: 'Chat stopped by user.' }]);
  }, []);

  const handleStart = useCallback(async (starterText) => {
    if (selections.length < 2) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setAccordionOpen(false);
    setMessages([]);
    setSystemMessages([]);
    setChatFinished(false);

    try {
      const currentConfig = JSON.stringify({
        selections, personaMode, roleStyle,
        a: personaMode === 'freeform'
          ? { name: personaA.name, freeform: personaA.freeform || '' }
          : { name: personaA.name, profile: personaA.profile, identity: personaA.identity, samples: personaA.samples },
        b: personaMode === 'freeform'
          ? { name: personaB.name, freeform: personaB.freeform || '' }
          : { name: personaB.name, profile: personaB.profile, identity: personaB.identity, samples: personaB.samples },
      });

      let cachedPrompts = rolePrompts;
      const configChanged = currentConfig !== lastRoleConfigRef.current;

      if (configChanged || !cachedPrompts) {
        setStatusText('Generating expert persona roles...');

        const genA = personaMode === 'freeform'
          ? generateRoleFreeform({ model_id: selections[0], name: personaA.name, text: personaA.freeform || '', role_style: roleStyle })
          : generateRole({ model_id: selections[0], name: personaA.name, profile: personaA.profile, identity: personaA.identity, samples: personaA.samples, role_style: roleStyle });
        const genB = personaMode === 'freeform'
          ? generateRoleFreeform({ model_id: selections[1], name: personaB.name, text: personaB.freeform || '', role_style: roleStyle })
          : generateRole({ model_id: selections[1], name: personaB.name, profile: personaB.profile, identity: personaB.identity, samples: personaB.samples, role_style: roleStyle });

        const [roleA, roleB] = await Promise.all([genA, genB]);

        if (controller.signal.aborted) return;

        cachedPrompts = {
          a: { name: personaA.name || 'Expert Persona A', model: getDisplayName(selections[0], providers, neonModels), prompt: roleA.role_prompt },
          b: { name: personaB.name || 'Expert Persona B', model: getDisplayName(selections[1], providers, neonModels), prompt: roleB.role_prompt },
        };
        setRolePrompts(cachedPrompts);
        lastRoleConfigRef.current = currentConfig;
      }

      setStatusText('Starting conversation...');

      await startChat(
        {
          persona_a_model_id: selections[0],
          persona_a_name: cachedPrompts.a.name,
          persona_a_role: cachedPrompts.a.prompt,
          persona_b_model_id: selections[1],
          persona_b_name: cachedPrompts.b.name,
          persona_b_role: cachedPrompts.b.prompt,
          starter_text: starterText,
        },
        {
          onSession: (data) => setSessionId(data.session_id),
          onMessage: (data) => {
            setMessages(prev => [...prev, data]);
            setStatusText('Conversation in progress...');
          },
          onSystem: (data) => {
            setSystemMessages(prev => [...prev, data]);
            if (data.text === 'End of Chat') {
              setChatFinished(true);
              setStatusText('');
            }
          },
          onStatus: (data) => setStatusText(data.message || ''),
          onError: (data) => {
            setStatusText('');
            setSystemMessages(prev => [...prev, { text: `Error: ${data.message}` }]);
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
          ? 'Daily conversation limit reached (20/day). Sign in with HuggingFace for unlimited access.'
          : `Error: ${err.message}`,
      }]);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      getAuthStatus().then(setAuth).catch(() => {});
    }
  }, [selections, personaA, personaB, personaMode, roleStyle, rolePrompts]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="header-brand-link">
            <img src="/neon-logo.png" alt="Neon.ai" className="app-logo" />
          </a>
          <h1 className="app-title"><a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="app-title-link">Neon.ai</a> - AI to AI Conversations</h1>
        </div>
        <div className="header-right">
          <AuthBadge auth={auth} />
          <button
            className="icon-btn"
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <DevMenu
            allModels={allModelsFlat}
            orchestratorModel={orchestratorModel}
            onOrchestratorChange={handleOrchestratorChange}
            personaMode={personaMode}
            onPersonaModeChange={handlePersonaModeChange}
            roleStyle={roleStyle}
            onRoleStyleChange={setRoleStyle}
            speedPriority={speedPriority}
            onSpeedPriorityChange={handleSpeedPriorityChange}
            showResponseTime={showResponseTime}
            onShowResponseTimeChange={setShowResponseTime}
            showChatStats={showChatStats}
            onShowChatStatsChange={setShowChatStats}
            rolePrompts={rolePrompts}
            onShowRolePrompts={() => setRolePromptsOpen(true)}
            onDownloadChatTxt={handleDownloadTxt}
            onDownloadChatMd={handleDownloadMd}
            onDownloadApiLog={handleDownloadApiLog}
            hasChat={messages.length > 0}
            hasApiLog={!!sessionId}
          />
        </div>
      </header>

      <main className="app-main">
        <LLMSelector
          providers={providers}
          neonModels={neonModels}
          selections={selections}
          onSelectionsChange={setSelections}
        />

        <div className="content">
          <PersonaAccordion
            isOpen={accordionOpen}
            onToggle={() => setAccordionOpen(o => !o)}
            personaA={personaA}
            personaB={personaB}
            onChangeA={setPersonaA}
            onChangeB={setPersonaB}
            selectedNameA={selectedNameA}
            selectedNameB={selectedNameB}
            mode={personaMode}
          />

          <ChatControls
            onStart={handleStart}
            onStop={handleStop}
            disabled={!canStart}
            isRunning={isRunning}
          />

          <ChatArea
            messages={messages}
            systemMessages={systemMessages}
            isRunning={isRunning}
            statusText={statusText}
            showResponseTime={showResponseTime}
            showChatStats={showChatStats}
          />
        </div>
      </main>
      <footer className="app-footer">
        Copyright Neon.ai. All rights reserved.{' '}
        <a href="https://www.neon.ai/contact" target="_blank" rel="noopener noreferrer">Patents and licensing</a>
      </footer>

      {rolePromptsOpen && rolePrompts && (
        <div className="modal-overlay" onClick={() => setRolePromptsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Generated Role Prompts</h2>
              <button className="modal-close" onClick={() => setRolePromptsOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="role-prompt-section">
                <h3>{rolePrompts.a.name} <span className="role-prompt-model">({rolePrompts.a.model})</span></h3>
                <pre className="role-prompt-text">{rolePrompts.a.prompt}</pre>
              </div>
              <div className="role-prompt-section">
                <h3>{rolePrompts.b.name} <span className="role-prompt-model">({rolePrompts.b.model})</span></h3>
                <pre className="role-prompt-text">{rolePrompts.b.prompt}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
