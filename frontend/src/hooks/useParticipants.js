import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchPersonas, fetchDemoQuestions, generateHumanCredentialFromProfile } from '../utils/api';
import * as storage from '../utils/storage';
import { DEFAULT_DEMO_PERSONAS } from '../utils/storage';
import { useSettings } from '../context/SettingsContext';
import {
  DEFAULT_TEAM_ID,
  getTeamById,
  inferTeamIdFromSelection,
} from '../config/teams';

function stubParticipantFromId(id) {
  const demo = DEFAULT_DEMO_PERSONAS.find((p) => p.participant_id === id);
  if (demo) {
    return {
      ...demo,
      kind: 'extra',
      model_display: demo.name,
      default_model_id: id,
      role_prompt: '',
    };
  }
  const tail = (id.split(':').pop() || id).replace(/_/g, ' ');
  const name = tail.replace(/([a-z])([A-Z])/g, '$1 $2').trim() || id;
  return {
    participant_id: id,
    kind: id.startsWith('neon:') ? 'neon' : 'extra',
    name,
    model_display: id.startsWith('neon:') ? (id.split(':')[1] || '').split('/').pop() || '' : '',
    default_model_id: id,
    role_prompt: '',
  };
}

export default function useParticipants() {
  const {
    maxParticipants,
    orchestratorModel,
    allModelsFlat,
    handleMaxParticipantsChange: settingsMaxParticipantsChange,
    handleConversationStructureChange,
    handleDecisionMethodChange,
  } = useSettings();

  const persisted = useMemo(() => storage.loadState(), []);
  const initialParticipants = useMemo(
    () => storage.resolveInitialParticipants(persisted),
    [persisted],
  );

  const [catalog, setCatalog] = useState({ neon: [], extra: [], tags: [] });
  const [demoQuestions, setDemoQuestions] = useState([]);
  const [expertPersonas, setExpertPersonas] = useState(persisted.expert_personas || []);
  const [selectedIds, setSelectedIds] = useState(initialParticipants.selectedIds);
  const [enabledMap, setEnabledMap] = useState(initialParticipants.enabledMap);
  const [modelAssignments, setModelAssignments] = useState(persisted.model_assignments || {});
  const [knowledgePrefs, setKnowledgePrefs] = useState(persisted.knowledge_prefs || {});
  const [autoSelectMode, setAutoSelectMode] = useState(!!persisted.auto_select_mode);
  const [priorManualSelection, setPriorManualSelection] = useState(null);
  const [expertModalOpen, setExpertModalOpen] = useState(false);
  const [expertEditing, setExpertEditing] = useState(null);
  const [humanParticipant, setHumanParticipant] = useState(persisted.human_participant || null);
  const [humanModalOpen, setHumanModalOpen] = useState(false);
  const [humanEditing, setHumanEditing] = useState(null);
  const [participantDirectoryOpen, setParticipantDirectoryOpen] = useState(false);
  const [directoryFocusParticipantId, setDirectoryFocusParticipantId] = useState(null);
  const [manageDocsOpen, setManageDocsOpen] = useState(false);
  const [manageDocsParticipant, setManageDocsParticipant] = useState(null);
  const [activeTeamId, setActiveTeamIdState] = useState(() => {
    if (persisted.active_team_id) return persisted.active_team_id;
    return inferTeamIdFromSelection(initialParticipants.selectedIds) || DEFAULT_TEAM_ID;
  });
  const humanCredentialGenRef = useRef(null);
  const getDraftQuestionRef = useRef(null);

  useEffect(() => {
    fetchPersonas()
      .then((data) => {
        setCatalog(data);
      })
      .catch((err) => {
        console.error('Failed to load personas:', err);
      });
    fetchDemoQuestions().then(d => setDemoQuestions(d.questions || []))
      .catch(err => console.error('Failed to load demo questions:', err));
  }, []);

  useEffect(() => { storage.setExpertPersonas(expertPersonas); }, [expertPersonas]);
  useEffect(() => { storage.setParticipantsSelected(selectedIds); }, [selectedIds]);
  useEffect(() => { storage.setParticipantsEnabled(enabledMap); }, [enabledMap]);
  useEffect(() => { storage.setModelAssignments(modelAssignments); }, [modelAssignments]);
  useEffect(() => { storage.setHumanParticipant(humanParticipant); }, [humanParticipant]);
  useEffect(() => { storage.setKnowledgePrefs(knowledgePrefs); }, [knowledgePrefs]);
  useEffect(() => { storage.setActiveTeamId(activeTeamId); }, [activeTeamId]);

  const applyTeamPreset = useCallback((teamId) => {
    const team = getTeamById(teamId);
    if (!team) return;
    const ids = [...team.participantIds];
    const humanReserved = humanParticipant ? 1 : 0;
    const needed = ids.length + humanReserved;
    if (needed > maxParticipants) {
      settingsMaxParticipantsChange(needed);
    }
    setSelectedIds(ids);
    setEnabledMap(() => {
      const next = {};
      ids.forEach((id) => { next[id] = true; });
      return next;
    });
    setActiveTeamIdState(team.id);
    storage.setActiveTeamId(team.id);
    if (autoSelectMode) {
      setAutoSelectMode(false);
      setPriorManualSelection(null);
      storage.setAutoSelectMode(false);
    }
    handleConversationStructureChange?.(team.conversationStructureId);
    handleDecisionMethodChange?.(team.decisionMethodId);
  }, [
    humanParticipant,
    maxParticipants,
    settingsMaxParticipantsChange,
    autoSelectMode,
    handleConversationStructureChange,
    handleDecisionMethodChange,
  ]);

  const allCatalogParticipants = useMemo(() => {
    const map = {};
    for (const p of (catalog.neon || [])) map[p.participant_id] = p;
    for (const p of (catalog.extra || [])) map[p.participant_id] = p;
    for (const p of (expertPersonas || [])) map[p.participant_id] = p;
    return map;
  }, [catalog, expertPersonas]);

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
      .map(id => allCatalogParticipants[id] || stubParticipantFromId(id))
      .filter(Boolean);
    return humanCatalogEntry ? [humanCatalogEntry, ...fromCatalog] : fromCatalog;
  }, [selectedIds, allCatalogParticipants, humanCatalogEntry]);

  const expertDefaultModelId = useMemo(() => {
    if (orchestratorModel && allModelsFlat.some(m => m.id === orchestratorModel)) {
      return orchestratorModel;
    }
    return allModelsFlat[0]?.id || '';
  }, [orchestratorModel, allModelsFlat]);

  const expertPanelContext = useMemo(() => {
    const editingId = expertEditing?.participant_id;
    return selectedParticipants
      .filter(p => p.kind !== 'human' && p.participant_id !== editingId)
      .map(p => {
        const mid = modelAssignments[p.participant_id] || p.model_id || '';
        const m = allModelsFlat.find(x => x.id === mid);
        return { name: p.name, model_id: mid, provider: m?.provider || '' };
      });
  }, [selectedParticipants, modelAssignments, expertEditing, allModelsFlat]);

  const enabledSelectedCount = useMemo(() => (
    selectedParticipants.filter(p => enabledMap[p.participant_id] !== false).length
  ), [selectedParticipants, enabledMap]);

  const handleMaxParticipantsChange = useCallback((n) => {
    settingsMaxParticipantsChange(n);
    const clamped = Math.max(3, Math.min(9, n));
    if (selectedIds.length > clamped) {
      setSelectedIds(prev => prev.slice(0, clamped));
    }
  }, [selectedIds, settingsMaxParticipantsChange]);

  const handleModelAssignmentChange = useCallback((participantId, modelId) => {
    setModelAssignments(prev => {
      const next = { ...prev };
      if (modelId) next[participantId] = modelId;
      else delete next[participantId];
      return next;
    });
  }, []);

  const setKnowledgePref = useCallback((participantId, key, value) => {
    setKnowledgePrefs((prev) => {
      const cur = prev[participantId] || { webSearch: false, documents: false };
      const field = key === 'webSearch' ? 'webSearch' : 'documents';
      return {
        ...prev,
        [participantId]: { ...cur, [field]: !!value },
      };
    });
  }, []);

  const openManageDocuments = useCallback((participant) => {
    if (!participant?.participant_id) return;
    setManageDocsParticipant(participant);
    setManageDocsOpen(true);
  }, []);

  const closeManageDocuments = useCallback(() => {
    setManageDocsOpen(false);
    setManageDocsParticipant(null);
  }, []);

  const handleToggleParticipant = useCallback((participant) => {
    const id = participant.participant_id;
    const humanReserved = humanParticipant ? 1 : 0;
    setSelectedIds(prev => {
      if (prev.includes(id)) {
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
    setSelectedIds(prev => {
      const next = prev.filter(x => x !== participantId);
      const inferred = inferTeamIdFromSelection(next);
      setActiveTeamIdState(inferred);
      storage.setActiveTeamId(inferred);
      return next;
    });
    setEnabledMap(em => {
      const next = { ...em };
      delete next[participantId];
      return next;
    });
  }, [humanParticipant]);

  const runHumanCredentialGeneration = useCallback(async (spec, question) => {
    const result = await generateHumanCredentialFromProfile({
      name: spec.name,
      question: (question || '').trim(),
      profile_text: spec.profile_text,
      participant_id: spec.participant_id,
      orchestrator_model_id: orchestratorModel || null,
    });
    const cred = result.credential || {};
    return {
      ...spec,
      credential_pending: false,
      credential_built_for_question: (question || '').trim(),
      credential_summary: {
        name: cred.name || spec.name,
        expertise: cred.expertise || '',
        personality: cred.personality || '',
        credibility_for_question: typeof cred.credibility_for_question === 'number'
          ? cred.credibility_for_question : 0.55,
        bias_to_watch: cred.bias_to_watch || '',
      },
    };
  }, [orchestratorModel]);

  const startHumanCredentialGeneration = useCallback((spec, question) => {
    const promise = runHumanCredentialGeneration(spec, question)
      .then((updated) => {
        setHumanParticipant(prev => (
          prev && prev.participant_id === spec.participant_id ? updated : prev
        ));
        return updated;
      })
      .catch((err) => {
        console.error('Human credential generation failed:', err);
        setHumanParticipant(prev => (
          prev && prev.participant_id === spec.participant_id
            ? { ...prev, credential_pending: false, credential_error: err.message }
            : prev
        ));
        throw err;
      });
    humanCredentialGenRef.current = promise;
    return promise;
  }, [runHumanCredentialGeneration]);

  const handleOpenHumanModal = useCallback(() => {
    setHumanEditing(humanParticipant);
    setHumanModalOpen(true);
  }, [humanParticipant]);

  const handleSaveHuman = useCallback((spec) => {
    const pending = { ...spec, credential_pending: true, credential_summary: null };
    setHumanParticipant(pending);
    setHumanModalOpen(false);
    setHumanEditing(null);
    const question = getDraftQuestionRef.current?.() || '';
    startHumanCredentialGeneration(pending, question);
  }, [startHumanCredentialGeneration]);

  const handleRemoveHuman = useCallback(() => {
    humanCredentialGenRef.current = null;
    setHumanParticipant(null);
    setHumanModalOpen(false);
    setHumanEditing(null);
  }, []);

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

  const closeExpertModal = useCallback(() => {
    setExpertModalOpen(false);
    setExpertEditing(null);
  }, []);

  const closeHumanModal = useCallback(() => {
    setHumanModalOpen(false);
    setHumanEditing(null);
  }, []);

  const openParticipantDirectory = useCallback((participantId = null) => {
    setDirectoryFocusParticipantId(participantId || null);
    setParticipantDirectoryOpen(true);
  }, []);

  const closeParticipantDirectory = useCallback(() => {
    setParticipantDirectoryOpen(false);
    setDirectoryFocusParticipantId(null);
  }, []);

  const handleConfirmParticipantSelection = useCallback((ids) => {
    const humanReserved = humanParticipant ? 1 : 0;
    const cap = Math.max(0, maxParticipants - humanReserved);
    const confirmed = (ids || []).slice(0, cap);
    setSelectedIds(confirmed);
    setEnabledMap(() => {
      const next = {};
      confirmed.forEach((id) => { next[id] = true; });
      return next;
    });
    const inferred = inferTeamIdFromSelection(confirmed);
    setActiveTeamIdState(inferred);
    storage.setActiveTeamId(inferred);
    if (autoSelectMode) {
      setAutoSelectMode(false);
      setPriorManualSelection(null);
      storage.setAutoSelectMode(false);
    }
    setParticipantDirectoryOpen(false);
  }, [maxParticipants, humanParticipant, autoSelectMode]);

  const autoSelectReady = autoSelectMode && Object.keys(allCatalogParticipants).length >= 2;
  const hasEnoughParticipantsToStart = autoSelectMode ? autoSelectReady : enabledSelectedCount >= 2;

  return {
    catalog,
    demoQuestions,
    expertPersonas,
    selectedIds,
    enabledMap,
    modelAssignments,
    autoSelectMode,
    selectedParticipants,
    allCatalogParticipants,
    humanCatalogEntry,
    humanParticipant,
    humanModalOpen,
    humanEditing,
    humanCredentialGenRef,
    getDraftQuestionRef,
    expertModalOpen,
    expertEditing,
    expertDefaultModelId,
    expertPanelContext,
    enabledSelectedCount,
    hasEnoughParticipantsToStart,
    autoSelectReady,
    activeTeamId,
    applyTeamPreset,
    handleToggleParticipant,
    handleSidebarToggleEnabled,
    handleSidebarRemove,
    handleModelAssignmentChange,
    handleMaxParticipantsChange,
    handleOpenHumanModal,
    handleSaveHuman,
    handleRemoveHuman,
    handleToggleAutoSelectMode,
    handleOpenExpertModal,
    handleSaveExpert,
    handleDeleteExpert,
    closeExpertModal,
    closeHumanModal,
    participantDirectoryOpen,
    directoryFocusParticipantId,
    openParticipantDirectory,
    closeParticipantDirectory,
    handleConfirmParticipantSelection,
    setHumanParticipant,
    setSelectedIds,
    setEnabledMap,
    knowledgePrefs,
    setKnowledgePref,
    manageDocsOpen,
    manageDocsParticipant,
    openManageDocuments,
    closeManageDocuments,
    runHumanCredentialGeneration,
  };
}
