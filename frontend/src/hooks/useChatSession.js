import { useState, useCallback, useRef, useEffect } from 'react';
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
import {
  loadChatHistory,
  saveChatToHistory,
  removeChatFromHistory,
  getChatById,
  createHistoryEntryId,
  saveActiveChatToSession,
  clearActiveChatSession,
  loadActiveChatFromSession,
} from '../utils/chatHistory';
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
  const [chatHistory, setChatHistory] = useState(() => loadChatHistory());
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  /** Offline wrap-up payload (from finished snapshot or live table fetch). */
  const [savedDecision, setSavedDecision] = useState(null);
  const [savedRows, setSavedRows] = useState(null);
  const [snackbar, setSnackbar] = useState(null);
  const abortRef = useRef(null);
  const historyEntryIdRef = useRef(null);
  const messagesRef = useRef(messages);
  const systemMessagesRef = useRef(systemMessages);
  const activeQuestionRef = useRef(activeQuestion);
  const sessionParticipantsRef = useRef(sessionParticipants);
  const sessionIdRef = useRef(sessionId);
  const savedDecisionRef = useRef(savedDecision);
  const savedRowsRef = useRef(savedRows);
  const tableDataRef = useRef(tableData);
  const credentialsDataRef = useRef(credentialsData);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { systemMessagesRef.current = systemMessages; }, [systemMessages]);
  useEffect(() => { activeQuestionRef.current = activeQuestion; }, [activeQuestion]);
  useEffect(() => { sessionParticipantsRef.current = sessionParticipants; }, [sessionParticipants]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { savedDecisionRef.current = savedDecision; }, [savedDecision]);
  useEffect(() => { savedRowsRef.current = savedRows; }, [savedRows]);
  useEffect(() => { tableDataRef.current = tableData; }, [tableData]);
  useEffect(() => { credentialsDataRef.current = credentialsData; }, [credentialsData]);

  // Restore a finished snapshot from sessionStorage after tab refresh.
  useEffect(() => {
    const snap = loadActiveChatFromSession();
    if (!snap?.finished || !snap.question) return;
    if ((snap.messages?.length || 0) + (snap.systemMessages?.length || 0) === 0) return;
    setMessages(snap.messages || []);
    setSystemMessages(snap.systemMessages || []);
    setActiveQuestion(snap.question || '');
    setSessionParticipants(snap.sessionParticipants || []);
    setSavedDecision(snap.decision ?? null);
    setSavedRows(Array.isArray(snap.rows) ? snap.rows : null);
    setTableData(snap.table || null);
    setCredentialsData(snap.credentials || null);
    setIsRunning(false);
    setSessionId(null);
    if (snap.id) {
      setActiveHistoryId(snap.id);
      historyEntryIdRef.current = snap.id;
    }
  }, []);

  const refreshChatHistory = useCallback(() => {
    setChatHistory(loadChatHistory());
  }, []);

  const buildSnapshotPartial = useCallback((overrides = {}) => ({
    id: overrides.id || historyEntryIdRef.current || null,
    question: overrides.question ?? activeQuestionRef.current ?? '',
    messages: overrides.messages ?? messagesRef.current ?? [],
    systemMessages: overrides.systemMessages ?? systemMessagesRef.current ?? [],
    sessionParticipants: overrides.sessionParticipants
      ?? sessionParticipantsRef.current
      ?? [],
    decision: overrides.decision !== undefined
      ? overrides.decision
      : savedDecisionRef.current,
    rows: overrides.rows !== undefined ? overrides.rows : savedRowsRef.current,
    table: overrides.table !== undefined ? overrides.table : tableDataRef.current,
    credentials: overrides.credentials !== undefined
      ? overrides.credentials
      : credentialsDataRef.current,
    finished: overrides.finished,
    savedAt: overrides.savedAt || Date.now(),
  }), []);

  /** Mirror live transcript into sessionStorage for tab restore. */
  useEffect(() => {
    const question = (activeQuestion || '').trim();
    if (!question && messages.length === 0 && systemMessages.length === 0) {
      return undefined;
    }
    if (activeHistoryId) {
      // Viewing a finished history entry — keep session mirror in sync with it.
      saveActiveChatToSession(buildSnapshotPartial({
        id: activeHistoryId,
        finished: true,
      }));
      return undefined;
    }
    const t = window.setTimeout(() => {
      saveActiveChatToSession(buildSnapshotPartial({
        finished: false,
      }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [
    messages,
    systemMessages,
    activeQuestion,
    sessionParticipants,
    savedDecision,
    savedRows,
    tableData,
    credentialsData,
    activeHistoryId,
    buildSnapshotPartial,
  ]);

  /** Snapshot current transcript into localStorage when it has content + a question. */
  const archiveCurrentChat = useCallback((opts = {}) => {
    const msgs = opts.messages ?? messagesRef.current ?? [];
    const sys = opts.systemMessages ?? systemMessagesRef.current ?? [];
    const question = (opts.question ?? activeQuestionRef.current ?? '').trim();
    if (!question || (msgs.length + sys.length) === 0) return null;
    if (opts.skipIfViewingHistory && activeHistoryId) return null;

    const id = opts.id || historyEntryIdRef.current || createHistoryEntryId();
    const entry = saveChatToHistory(buildSnapshotPartial({
      ...opts,
      id,
      messages: msgs,
      systemMessages: sys,
      question,
      messageCount: msgs.length + sys.length,
      savedAt: Date.now(),
      finished: opts.finished !== undefined ? opts.finished : true,
    }));
    historyEntryIdRef.current = entry.id;
    refreshChatHistory();
    return entry;
  }, [activeHistoryId, refreshChatHistory, buildSnapshotPartial]);

  const clearLiveSessionUi = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setMessages([]);
    setSystemMessages([]);
    setIsRunning(false);
    setStatusText('');
    setPause(null);
    setSessionId(null);
    setSessionParticipants([]);
    setActiveQuestion('');
    setAwaitingHuman(null);
    setHumanSubmitting(false);
    setTableData(null);
    setTableOpen(false);
    setCredentialsData(null);
    setCredentialsOpen(false);
    setSavedDecision(null);
    setSavedRows(null);
    setActiveHistoryId(null);
    historyEntryIdRef.current = null;
    clearActiveChatSession();
  }, []);

  const loadHistoryChat = useCallback((id) => {
    const entry = getChatById(id);
    if (!entry) return;
    if (activeHistoryId !== id) {
      archiveCurrentChat({ skipIfViewingHistory: true });
    }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setIsRunning(false);
    setStatusText('');
    setPause(null);
    setSessionId(null);
    setAwaitingHuman(null);
    setHumanSubmitting(false);
    setMessages(entry.messages || []);
    setSystemMessages(entry.systemMessages || []);
    setActiveQuestion(entry.question || '');
    setSessionParticipants(entry.sessionParticipants || []);
    setSavedDecision(entry.decision ?? null);
    setSavedRows(Array.isArray(entry.rows) ? entry.rows : null);
    setTableData(entry.table || (
      entry.decision || entry.rows
        ? {
          question: entry.question,
          decision: entry.decision,
          rows: entry.rows || [],
          final_report: entry.final_report,
          final_report_kind: entry.final_report_kind,
        }
        : null
    ));
    setTableOpen(false);
    setCredentialsData(entry.credentials || null);
    setCredentialsOpen(false);
    setActiveHistoryId(entry.id);
    historyEntryIdRef.current = entry.id;
    saveActiveChatToSession({ ...entry, finished: true });
  }, [activeHistoryId, archiveCurrentChat]);

  const deleteHistoryChat = useCallback((id) => {
    const next = removeChatFromHistory(id);
    setChatHistory(next);
    if (activeHistoryId === id) {
      clearLiveSessionUi();
    }
  }, [activeHistoryId, clearLiveSessionUi]);

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
      setSnackbar({ message: 'Chat downloaded as .txt' });
    } catch (err) {
      console.error('Export failed:', err);
      setSnackbar({ message: 'Download failed. Try again.' });
    }
  }, [sessionId, downloadFile]);

  const handleDownloadMd = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportChat(sessionId, 'md');
      downloadFile(r.filename, r.content);
      setSnackbar({ message: 'Chat downloaded as .md' });
    } catch (err) {
      console.error('Export failed:', err);
      setSnackbar({ message: 'Download failed. Try again.' });
    }
  }, [sessionId, downloadFile]);

  const handleDownloadCsvTable = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportChat(sessionId, 'csv-table');
      downloadFile(r.filename, r.content, 'text/csv;charset=utf-8');
      setSnackbar({ message: 'Summary table downloaded as .csv' });
    } catch (err) {
      console.error('CSV export failed:', err);
      setSnackbar({ message: 'CSV download failed. Try again.' });
    }
  }, [sessionId, downloadFile]);

  const handleDownloadApiLog = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await exportApiLog(sessionId);
      downloadFile('api_log.json', JSON.stringify(r, null, 2), 'application/json');
      setSnackbar({ message: 'API log downloaded' });
    } catch (err) {
      console.error('API log export failed:', err);
      setSnackbar({ message: 'API log download failed. Try again.' });
    }
  }, [sessionId, downloadFile]);

  const handleShowTableView = useCallback(async () => {
    if (tableDataRef.current) {
      setTableData(tableDataRef.current);
      setTableOpen(true);
      return;
    }
    if (!sessionId) return;
    try {
      const data = await fetchTableView(sessionId);
      setTableData(data);
      setTableOpen(true);
      if (Array.isArray(data?.rows)) setSavedRows(data.rows);
      if (data?.decision) setSavedDecision(data.decision);
    } catch (err) { console.error('Table fetch failed:', err); }
  }, [sessionId]);

  const handleShowCredentials = useCallback(async () => {
    if (credentialsDataRef.current) {
      setCredentialsData(credentialsDataRef.current);
      setCredentialsOpen(true);
      return;
    }
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

  const handleStartNewChat = useCallback(() => {
    archiveCurrentChat({ skipIfViewingHistory: true });
    clearLiveSessionUi();
  }, [archiveCurrentChat, clearLiveSessionUi]);

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

    archiveCurrentChat({ skipIfViewingHistory: true });

    const controller = new AbortController();
    abortRef.current = controller;
    historyEntryIdRef.current = createHistoryEntryId();
    setActiveHistoryId(null);
    setIsRunning(true);
    setMessages([]);
    setSystemMessages([]);
    setStatusText(autoSelectMode ? 'Picking participants...' : 'Starting conversation...');
    setSessionId(null);
    setSessionParticipants([]);
    setPause(null);
    setActiveQuestion(theQuestion.trim());
    setCredentialsData(null);
    setSavedDecision(null);
    setSavedRows(null);
    setTableData(null);
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
              const msg = { ...data, role: 'orchestrator' };
              if (msg.kind === 'ballot_options' || msg.kind === 'motion') {
                msg.ballots = Array.isArray(msg.ballots) ? msg.ballots : [];
                msg.vote_complete = false;
                // Structure "motion on the floor" (debate) includes mover_id;
                // vote announcements do not — only those get Aye/Nay/Abstain rows.
                if (msg.kind === 'motion' && !msg.mover_id && !Array.isArray(data.options)) {
                  msg.options = ['Aye', 'Nay', 'Abstain'];
                }
              }
              setMessages(prev => [...prev, msg]);
            } else if (data?.message) {
              setStatusText(data.message);
            }
          },
          onStatus: (data) => setStatusText(data.message || ''),
          onSystem: (data) => {
            setSystemMessages(prev => [...prev, data]);
            if (data.text === 'End of Chat') {
              setStatusText('');
              const msgs = messagesRef.current || [];
              const sys = [...(systemMessagesRef.current || []), data];
              const sid = sessionIdRef.current;
              (async () => {
                let table = null;
                let credentials = null;
                let decision = null;
                let rows = null;
                if (sid) {
                  try {
                    table = await fetchTableView(sid);
                    decision = table?.decision ?? null;
                    rows = Array.isArray(table?.rows) ? table.rows : [];
                    setTableData(table);
                    setSavedDecision(decision);
                    setSavedRows(rows);
                  } catch (err) {
                    console.error('End-of-chat table snapshot failed:', err);
                  }
                  try {
                    credentials = await fetchCredentials(sid);
                    setCredentialsData(credentials);
                  } catch (err) {
                    console.error('End-of-chat credentials snapshot failed:', err);
                  }
                }
                const entry = archiveCurrentChat({
                  messages: msgs,
                  systemMessages: sys,
                  decision,
                  rows,
                  table,
                  credentials,
                  finished: true,
                });
                if (entry?.id) {
                  setActiveHistoryId(entry.id);
                  saveActiveChatToSession({ ...entry, finished: true });
                }
              })();
            }
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
            setMessages((prev) => {
              let lastIdx = -1;
              for (let i = prev.length - 1; i >= 0; i -= 1) {
                const m = prev[i];
                if (m.role === 'orchestrator'
                  && (m.kind === 'ballot_options'
                    || (m.kind === 'motion' && !m.mover_id))
                  && !m.vote_complete) {
                  lastIdx = i;
                  break;
                }
              }
              if (lastIdx >= 0) {
                const target = prev[lastIdx];
                const ballots = Array.isArray(target.ballots) ? target.ballots : [];
                const next = [...prev];
                next[lastIdx] = {
                  ...target,
                  ballots: [...ballots, {
                    voter_id: data?.voter_id,
                    voter_name: data?.voter_name,
                    vote: data?.vote,
                    choice: data?.choice,
                    ranking: data?.ranking,
                    reason: data?.reason,
                    ok: data?.ok,
                  }],
                };
                return next;
              }
              const voter = data?.voter_name || 'A voter';
              let line;
              if (data?.vote) line = `${voter} votes ${data.vote}.`;
              else if (Array.isArray(data?.ranking) && data.ranking.length > 0) {
                line = `${voter} submitted ranking: ${data.ranking.join(' > ')}.`;
              } else if (typeof data?.choice === 'number' && data.choice > 0) {
                line = `${voter} votes for option ${data.choice}.`;
              } else line = `${voter} abstained or returned an invalid ballot.`;
              return [...prev, {
                role: 'system',
                kind: 'vote_cast',
                text: line,
                timestamp: Date.now() / 1000,
              }];
            });
          },
          onVoteTally: () => {
            setMessages((prev) => {
              let lastIdx = -1;
              for (let i = prev.length - 1; i >= 0; i -= 1) {
                const m = prev[i];
                if (m.role === 'orchestrator'
                  && (m.kind === 'ballot_options'
                    || (m.kind === 'motion' && !m.mover_id))) {
                  lastIdx = i;
                  break;
                }
              }
              if (lastIdx < 0) return prev;
              const next = [...prev];
              next[lastIdx] = { ...next[lastIdx], vote_complete: true };
              return next;
            });
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
    archiveCurrentChat,
  ]);

  const startDisabled = isRunning || !hasEnoughParticipantsToStart;
  const startDisabledReason = autoSelectMode
    ? (!autoSelectReady ? 'No candidate participants available for auto-select.' : '')
    : enabledSelectedCount < 2 ? 'Add at least 2 active participants to start.' : '';
  const startDisabledTooltip = autoSelectMode
    ? (!autoSelectReady ? 'No candidate participants available for auto-select.' : '')
    : enabledSelectedCount < 2 ? 'Select at least 2 participants.' : '';

  const rosterParticipants = sessionParticipants.length > 0 ? sessionParticipants : selectedParticipants;
  const hasContent = messages.length + systemMessages.length > 0;

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
    chatHistory,
    activeHistoryId,
    savedDecision,
    savedRows,
    hasEnoughParticipantsToStart,
    startDisabled,
    startDisabledReason,
    startDisabledTooltip,
    hasContent,
    hasChat: messages.length > 0,
    hasApiLog: !!sessionId,
    hasCredentials: !!sessionId || !!credentialsData,
    getDraftQuestionRef,
    handleStart,
    handleStop,
    handleStartNewChat,
    loadHistoryChat,
    deleteHistoryChat,
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
    snackbar,
    clearSnackbar: () => setSnackbar(null),
  };
}
