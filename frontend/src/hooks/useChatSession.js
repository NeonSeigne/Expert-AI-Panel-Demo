import { useState, useCallback, useRef } from 'react';
import {
  startChat,
  continueChat,
  exportChat,
  exportApiLog,
  fetchTableView,
  fetchCredentials,
  autoSelectParticipants,
  getAuthStatus,
  submitHumanResponse,
  patchHumanCredential,
} from '../utils/api';
import { isRateLimitedUser, appendInlineChatNote } from '../utils/chatHelpers';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';

export default function useChatSession() {
  const {
    auth,
    setAuth,
    dailyLimit,
    setRateLimitNotice,
    orchestratorModel,
    summarizerModel,
    maxParticipants,
    limitsOverrides,
    conversationStructureId,
    decisionMethodId,
  } = useSettings();

  const {
    autoSelectMode,
    autoSelectReady,
    enabledSelectedCount,
    hasEnoughParticipantsToStart,
    selectedParticipants,
    allCatalogParticipants,
    humanCatalogEntry,
    humanParticipant,
    enabledMap,
    modelAssignments,
    humanCredentialGenRef,
    getDraftQuestionRef,
    setHumanParticipant,
    setSelectedIds,
    setEnabledMap,
    runHumanCredentialGeneration,
  } = useParticipants();

  const [messages, setMessages] = useState([]);
  const [systemMessages, setSystemMessages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessionParticipants, setSessionParticipants] = useState([]);
  const [pause, setPause] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState('');
  const [tableData, setTableData] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [credentialsData, setCredentialsData] = useState(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [awaitingHuman, setAwaitingHuman] = useState(null);
  const [humanSubmitting, setHumanSubmitting] = useState(false);
  const abortRef = useRef(null);

  const buildStartPayload = useCallback((theQuestion, participantsOverride, humanOverride) => {
    const sourceList = participantsOverride ?? selectedParticipants;
    const baseList = sourceList.filter(p => enabledMap[p.participant_id] !== false);
    const participants = baseList.map(p => ({
      participant_id: p.participant_id,
      kind: p.kind || (p.participant_id.startsWith('neon:') ? 'neon'
        : (p.participant_id.startsWith('extra_') ? 'extra' : 'expert')),
      name: p.name,
      role_prompt: p.kind === 'human' ? null : (p.role_prompt || null),
      model_id_override: p.kind === 'human' ? null : (modelAssignments[p.participant_id] || null),
    }));
    const expert_payload = baseList
      .filter(p => (p.kind || '').startsWith('expert'))
      .map(p => ({
        participant_id: p.participant_id,
        name: p.name,
        model_id: modelAssignments[p.participant_id] || p.model_id,
        role_prompt: p.role_prompt,
      }));
    const hp = humanOverride ?? humanParticipant;
    const humanInList = baseList.find(p => p.kind === 'human');
    let human_credential = null;
    if (humanInList && hp) {
      const cs = hp.credential_summary || {};
      human_credential = {
        participant_id: humanInList.participant_id,
        name: humanInList.name,
        expertise: cs.expertise || hp.profile_text?.slice(0, 500) || '',
        personality: cs.personality || '',
        credibility_for_question: typeof cs.credibility_for_question === 'number'
          ? cs.credibility_for_question : 0.55,
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
      limits: limitsOverrides,
      human_credential,
      conversation_structure_id: conversationStructureId,
      decision_method_id: decisionMethodId,
    };
  }, [
    selectedParticipants, enabledMap, modelAssignments,
    orchestratorModel, summarizerModel, maxParticipants,
    limitsOverrides, humanParticipant,
    conversationStructureId, decisionMethodId,
  ]);

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

  const handleShowTableView = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await fetchTableView(sessionId);
      setTableData(data);
      setTableOpen(true);
    } catch (err) { console.error('Table fetch failed:', err); }
  }, [sessionId]);

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

  const handleEditHumanCredential = useCallback(async (patch) => {
    if (!sessionId) return;
    try {
      const result = await patchHumanCredential(sessionId, patch);
      const updated = result.credential;
      if (updated) {
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
        const data = await fetchCredentials(sessionId);
        setCredentialsData(data);
      }
    } catch (err) {
      console.error('Edit human credential failed:', err);
    }
  }, [sessionId, setHumanParticipant]);

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

  const handleHumanSubmit = useCallback(async (text) => {
    if (!sessionId || !awaitingHuman) return;
    setHumanSubmitting(true);
    try {
      await submitHumanResponse(sessionId, { text });
    } catch (err) {
      console.error('Human response failed:', err);
      setSystemMessages(prev => [...prev, { text: `Couldn't send your message: ${err.message}` }]);
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

  const handleStart = useCallback(async (theQuestion) => {
    if (!theQuestion || !theQuestion.trim()) return;
    if (isRateLimitedUser(auth) && auth.remaining_conversations === 0) {
      setRateLimitNotice('exhausted');
      return;
    }
    if (!autoSelectMode && enabledSelectedCount < 2) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setMessages([]);
    setSystemMessages([]);
    setStatusText(autoSelectMode ? 'Picking participants...' : 'Starting conversation...');
    setSessionId(null);
    setSessionParticipants([]);
    setPause(null);
    setActiveQuestion(theQuestion.trim());
    setCredentialsData(null);
    setAwaitingHuman(null);

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
        model_id: modelAssignments[p.participant_id] || p.model_id || p.default_model_id || '',
      }));
      try {
        const humanEnabled = humanParticipant
          && enabledMap[humanParticipant.participant_id] !== false;
        const humanReserved = humanEnabled ? 1 : 0;
        const llmTarget = Math.max(2, maxParticipants - humanReserved);
        const result = await autoSelectParticipants({
          question: theQuestion.trim(),
          count: llmTarget,
          candidates: candidatesPayload,
          orchestrator_model_id: orchestratorModel,
        });
        const chosenIds = result.selected || [];
        const chosenLlms = chosenIds.map(id => allCatalogParticipants[id]).filter(Boolean);
        resolvedParticipants = humanEnabled && humanCatalogEntry
          ? [humanCatalogEntry, ...chosenLlms] : chosenLlms;
        if (resolvedParticipants.length < 2) {
          setIsRunning(false);
          setStatusText('');
          setSystemMessages(prev => [...prev, {
            text: 'Auto-select returned too few participants. Turn auto-select off and pick manually.',
          }]);
          return;
        }
        setSelectedIds(chosenIds);
        setEnabledMap(prev => {
          const next = { ...prev };
          for (const id of chosenIds) next[id] = true;
          return next;
        });
        if (result.rationale) {
          setSystemMessages(prev => [...prev, { text: `Auto-select rationale: ${result.rationale}` }]);
        }
        setStatusText('Starting conversation...');
      } catch (err) {
        console.error('Auto-select failed:', err);
        setIsRunning(false);
        setStatusText('');
        setSystemMessages(prev => [...prev, { text: `Auto-select failed: ${err.message}` }]);
        return;
      }
    }

    let humanForStart = humanParticipant;
    const humanEnabledForStart = humanParticipant
      && enabledMap[humanParticipant.participant_id] !== false;
    if (humanEnabledForStart) {
      const q = theQuestion.trim();
      const needsQuestionRefresh = q && humanParticipant.credential_built_for_question !== q;
      if (humanParticipant.credential_pending && humanCredentialGenRef.current) {
        setStatusText('Finishing credential summary...');
        try {
          humanForStart = await humanCredentialGenRef.current;
        } catch {
          humanForStart = humanParticipant;
        }
      }
      if (!humanForStart?.credential_summary?.expertise || needsQuestionRefresh) {
        setStatusText('Preparing credential summary...');
        try {
          humanForStart = await runHumanCredentialGeneration(humanParticipant, q);
          setHumanParticipant(humanForStart);
          humanCredentialGenRef.current = Promise.resolve(humanForStart);
        } catch (err) {
          setIsRunning(false);
          setStatusText('');
          setSystemMessages(prev => [...prev, {
            text: `Could not generate human credential: ${err.message}`,
          }]);
          return;
        }
      }
    }

    try {
      await startChat(
        buildStartPayload(theQuestion, resolvedParticipants, humanForStart),
        {
          onSession: (data) => {
            setSessionId(data.session_id);
            setSessionParticipants(data.participants || []);
          },
          onMessage: (data) => {
            setMessages(prev => {
              const mid = data?.message_id;
              if (!mid) return [...prev, data];
              const idx = prev.findIndex(m => m.message_id === mid);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...data, streaming: false };
                return next;
              }
              return [...prev, data];
            });
            setStatusText('Conversation in progress...');
          },
          onMessageStreamStart: (data) => {
            setMessages(prev => [...prev, {
              ...data, role: 'participant', text: '', streaming: true,
              timestamp: Date.now() / 1000,
            }]);
          },
          onMessageDelta: (data) => {
            const mid = data?.message_id;
            const delta = data?.delta || '';
            if (!mid || !delta) return;
            setMessages(prev => prev.map(m => (
              m.message_id === mid ? { ...m, text: `${m.text || ''}${delta}` } : m
            )));
          },
          onOrchestrator: (data) => {
            if (data && data.text) {
              setMessages(prev => [...prev, { ...data, role: 'orchestrator' }]);
            } else if (data?.message) {
              setStatusText(data.message);
            }
          },
          onStatus: (data) => setStatusText(data.message || ''),
          onSystem: (data) => {
            setSystemMessages(prev => [...prev, data]);
            if (data.text === 'End of Chat') setStatusText('');
          },
          onError: (data) => {
            setStatusText('');
            setSystemMessages(prev => [...prev, { text: `Error: ${data.message}` }]);
          },
          onParticipantError: (data) => {
            appendInlineChatNote(setMessages,
              `${data.name || 'A participant'} couldn't respond this turn.`, {
                kind: 'participant_error', phase: data.phase, participant_id: data.participant_id,
              });
          },
          onParticipantSubstituted: (data) => {
            const name = data.name || 'A participant';
            const toDisplay = data.to_model_display || data.to_model_id || 'a substitute model';
            appendInlineChatNote(setMessages,
              `${name}'s primary model didn't respond; continuing with ${toDisplay}.`,
              { kind: 'participant_substituted', phase: data.phase });
          },
          onParticipantReplaced: (data) => {
            if (Array.isArray(data?.roster)) setSessionParticipants(data.roster);
            appendInlineChatNote(setMessages,
              `${data.original_name || 'A participant'} couldn't give an initial opinion; ${data.new_name || 'an alternate'} is taking their place.`,
              { kind: 'participant_replaced', phase: data.phase });
          },
          onVoteCast: (data) => {
            const voter = data?.voter_name || 'A voter';
            let line;
            if (data?.vote) line = `${voter} votes ${data.vote}.`;
            else if (Array.isArray(data?.ranking) && data.ranking.length > 0) {
              line = `${voter} submitted ranking: ${data.ranking.join(' > ')}.`;
            } else if (typeof data?.choice === 'number' && data.choice > 0) {
              line = `${voter} votes for option ${data.choice}.`;
            } else line = `${voter} abstained or returned an invalid ballot.`;
            appendInlineChatNote(setMessages, line, { kind: 'vote_cast' });
          },
          onVoteTally: (data) => {
            appendInlineChatNote(setMessages,
              `Vote complete (${data?.kind || 'vote'}); see report below.`,
              { kind: 'vote_tally' });
          },
          onFailsafePause: (data) => setPause({ reason: 'messages', ...data }),
          onOrchestratorCapPause: (data) => setPause({ reason: 'orchestrator', ...data }),
          onCredentialsUpdated: (data) => {
            setCredentialsData({
              session_id: data.session_id,
              question: theQuestion.trim(),
              credentials: data.credentials || [],
              stage: data.stage || 'built',
            });
          },
          onHumanTurnNeeded: (data) => {
            setAwaitingHuman(data || null);
            setStatusText(`${data?.speaker_name || 'Human'} is up next.`);
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
    buildStartPayload, enabledSelectedCount, dailyLimit, auth, setAuth, setRateLimitNotice,
    autoSelectMode, allCatalogParticipants, modelAssignments, maxParticipants, orchestratorModel,
    enabledMap, humanParticipant, humanCatalogEntry, runHumanCredentialGeneration,
    humanCredentialGenRef, setHumanParticipant, setSelectedIds, setEnabledMap,
  ]);

  const startDisabled = isRunning || !hasEnoughParticipantsToStart;
  const startDisabledReason = autoSelectMode
    ? (!autoSelectReady ? 'No candidate participants available for auto-select.' : '')
    : enabledSelectedCount < 2 ? 'Add at least 2 active participants to start.' : '';
  const startDisabledTooltip = autoSelectMode
    ? (!autoSelectReady ? 'No candidate participants available for auto-select.' : '')
    : enabledSelectedCount < 2 ? 'Select at least 2 participants.' : '';

  const rosterParticipants = sessionParticipants.length > 0 ? sessionParticipants : selectedParticipants;

  return {
    messages,
    systemMessages,
    isRunning,
    statusText,
    sessionId,
    sessionParticipants,
    rosterParticipants,
    pause,
    activeQuestion,
    tableData,
    tableOpen,
    setTableOpen,
    credentialsData,
    credentialsOpen,
    setCredentialsOpen,
    awaitingHuman,
    humanSubmitting,
    hasEnoughParticipantsToStart,
    startDisabled,
    startDisabledReason,
    startDisabledTooltip,
    hasChat: messages.length > 0,
    hasApiLog: !!sessionId,
    hasCredentials: !!sessionId,
    getDraftQuestionRef,
    handleStart,
    handleStop,
    handleContinuePause,
    handleHumanSubmit,
    handleHumanSkip,
    handleDownloadTxt,
    handleDownloadMd,
    handleDownloadCsvTable,
    handleDownloadApiLog,
    handleShowTableView,
    handleShowCredentials,
    handleRefreshCredentials,
    handleEditHumanCredential,
  };
}
