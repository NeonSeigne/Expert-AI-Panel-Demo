import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchModels,
  getOrchestrator,
  setOrchestrator,
  getSpeedPriority,
  setSpeedPriority,
  fetchConversationFormats,
  getAuthStatus,
  getRateLimitStatus,
  fetchConversationLimitsDefaults,
  fetchPromptCatalog,
} from '../utils/api';
import * as storage from '../utils/storage';
import { isRateLimitedUser } from '../utils/chatHelpers';

export default function useSettings() {
  const persisted = useMemo(() => storage.loadState(), []);

  const [theme, setTheme] = useState(() => persisted.theme
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [orchestratorModel, setOrchestratorModelState] = useState(persisted.orchestrator_model_id);
  const [summarizerModel, setSummarizerModelState] = useState(persisted.summarizer_model_id);
  const [maxParticipants, setMaxParticipants] = useState(persisted.max_participants || 5);
  const [speedPriority, setSpeedPriorityState] = useState(false);
  const [conversationFormats, setConversationFormats] = useState({
    structures: [], decisions: [],
    default_structure_id: 'collaborative',
    default_decision_id: 'consensus',
  });
  const [conversationStructureId, setConversationStructureIdState] = useState(
    persisted.conversation_structure_id || null,
  );
  const [decisionMethodId, setDecisionMethodIdState] = useState(
    persisted.decision_method_id || null,
  );
  const [providers, setProviders] = useState([]);
  const [neonModels, setNeonModels] = useState([]);
  const [showResponseTime, setShowResponseTime] = useState(false);
  const [showChatStats, setShowChatStats] = useState(false);
  const [auth, setAuth] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(30);
  const [limitsSchema, setLimitsSchema] = useState(null);
  const [limitsOverrides, setLimitsOverrides] = useState(persisted.conversation_limits || {});
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [promptCatalog, setPromptCatalog] = useState(null);
  const [promptCatalogOpen, setPromptCatalogOpen] = useState(false);
  const [rateLimitNotice, setRateLimitNotice] = useState(null);
  const oneLeftNoticeShownRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    storage.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    fetchModels().then(d => {
      setProviders(d.providers || []);
      setNeonModels(d.neon_models || []);
    }).catch(err => console.error('Failed to load models:', err));
    getOrchestrator().then(d => {
      if (!persisted.orchestrator_model_id && d?.model_id) {
        setOrchestratorModelState(d.model_id);
      }
    }).catch(() => {});
    getSpeedPriority().then(d => {
      if (typeof d?.enabled === 'boolean') setSpeedPriorityState(d.enabled);
    }).catch(() => {});
    fetchConversationFormats().then(catalog => {
      if (!catalog || !Array.isArray(catalog.structures)) return;
      setConversationFormats(catalog);
    }).catch(() => {});
    getAuthStatus().then(setAuth).catch(() => {});
    getRateLimitStatus().then(d => {
      if (d?.daily_limit) setDailyLimit(d.daily_limit);
    }).catch(() => {});
  }, [persisted.orchestrator_model_id]);

  useEffect(() => {
    if (!isRateLimitedUser(auth)) return;
    if (auth.remaining_conversations === 1 && !oneLeftNoticeShownRef.current) {
      oneLeftNoticeShownRef.current = true;
      setRateLimitNotice('one_left');
    }
  }, [auth]);

  useEffect(() => { storage.setOrchestratorModelId(orchestratorModel); }, [orchestratorModel]);
  useEffect(() => { storage.setSummarizerModelId(summarizerModel); }, [summarizerModel]);
  useEffect(() => { storage.setMaxParticipants(maxParticipants); }, [maxParticipants]);

  const allModelsFlat = useMemo(() => {
    const list = [];
    for (const p of providers) {
      for (const m of p.models) {
        list.push({ id: m.id, name: m.name, provider: p.name, kind: 'provider' });
      }
    }
    for (const nm of neonModels) {
      for (const p of (nm.personas || [])) {
        if (p.enabled === false) continue;
        list.push({
          id: `neon:${nm.model_id}:${p.persona_name}`,
          name: p.persona_name,
          provider: `Neon / ${nm.name.split('/').pop()}`,
          kind: 'neon_character',
        });
      }
    }
    return list;
  }, [providers, neonModels]);

  const neonPromptByModelId = useMemo(() => {
    const map = {};
    for (const nm of neonModels) {
      for (const p of (nm.personas || [])) {
        if (p.enabled === false) continue;
        const id = `neon:${nm.model_id}:${p.persona_name}`;
        const sp = (p.system_prompt || '').trim();
        if (sp) map[id] = sp;
      }
    }
    return map;
  }, [neonModels]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  }, []);

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
    setSpeedPriorityState(enabled);
    try {
      const d = await setSpeedPriority(enabled);
      if (typeof d?.enabled === 'boolean') setSpeedPriorityState(d.enabled);
    } catch (err) {
      console.error('Failed to set speed priority:', err);
      setSpeedPriorityState(!enabled);
    }
  }, []);

  const handleConversationStructureChange = useCallback((id) => {
    setConversationStructureIdState(id || null);
    storage.setConversationStructureId(id || null);
  }, []);

  const handleDecisionMethodChange = useCallback((id) => {
    setDecisionMethodIdState(id || null);
    storage.setDecisionMethodId(id || null);
  }, []);

  const handleMaxParticipantsChange = useCallback((n) => {
    const clamped = Math.max(3, Math.min(9, n));
    setMaxParticipants(clamped);
  }, []);

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

  return {
    theme,
    toggleTheme,
    providers,
    neonModels,
    allModelsFlat,
    neonPromptByModelId,
    orchestratorModel,
    summarizerModel,
    speedPriority,
    conversationFormats,
    conversationStructureId,
    decisionMethodId,
    showResponseTime,
    setShowResponseTime,
    showChatStats,
    setShowChatStats,
    maxParticipants,
    limitsSchema,
    limitsOverrides,
    limitsOpen,
    setLimitsOpen,
    promptCatalog,
    promptCatalogOpen,
    setPromptCatalogOpen,
    auth,
    setAuth,
    dailyLimit,
    rateLimitNotice,
    setRateLimitNotice,
    handleOrchestratorChange,
    handleSummarizerChange,
    handleSpeedPriorityChange,
    handleConversationStructureChange,
    handleDecisionMethodChange,
    handleMaxParticipantsChange,
    handleShowConversationLimits,
    handleConversationLimitsChange,
    handleConversationLimitsResetAll,
    handleShowPromptCatalog,
  };
}
