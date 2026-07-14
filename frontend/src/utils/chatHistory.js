/**
 * Client-side chat history for the CCAI demo.
 *
 * Separate localStorage key from prefs (`ccai-vibe-demo`) so large
 * transcripts don't risk corrupting settings on quota pressure.
 *
 * Finished chats are stored as self-contained JSON snapshots so the
 * UI (transcript + wrap-up) can restore without a live backend session.
 */

const NS = 'ccai-chat-history';
const ACTIVE_NS = 'ccai-active-chat';
const MAX_ENTRIES = 20;
const SNAPSHOT_VERSION = 2;

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readAll() {
  try {
    const raw = window.localStorage.getItem(NS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('chat history read failed:', err);
    return [];
  }
}

function writeAll(entries) {
  try {
    window.localStorage.setItem(NS, JSON.stringify(entries));
  } catch (err) {
    console.warn('chat history write failed:', err);
  }
}

/**
 * Normalize a history / active-session snapshot for display + storage.
 */
export function buildChatSnapshot(partial = {}) {
  const messages = Array.isArray(partial.messages) ? partial.messages : [];
  const systemMessages = Array.isArray(partial.systemMessages)
    ? partial.systemMessages
    : [];
  const sessionParticipants = Array.isArray(partial.sessionParticipants)
    ? partial.sessionParticipants
    : [];
  const table = partial.table && typeof partial.table === 'object'
    ? partial.table
    : null;
  const rows = Array.isArray(partial.rows)
    ? partial.rows
    : (Array.isArray(table?.rows) ? table.rows : []);
  const decision = partial.decision != null
    ? partial.decision
    : (table?.decision ?? null);
  const credentials = partial.credentials && typeof partial.credentials === 'object'
    ? partial.credentials
    : null;

  return {
    version: SNAPSHOT_VERSION,
    id: partial.id || null,
    savedAt: partial.savedAt || Date.now(),
    finished: Boolean(partial.finished),
    question: (partial.question || '').trim(),
    messages,
    systemMessages,
    sessionParticipants,
    messageCount: typeof partial.messageCount === 'number'
      ? partial.messageCount
      : messages.length + systemMessages.length,
    // Wrap-up / table payload — enough to render Session wrap-up offline
    decision,
    rows,
    table,
    final_report: partial.final_report ?? table?.final_report ?? null,
    final_report_kind: partial.final_report_kind ?? table?.final_report_kind ?? null,
    credentials,
  };
}

export function loadChatHistory() {
  return readAll();
}

/**
 * Upsert an entry (newest first). Evicts oldest when over MAX_ENTRIES.
 * Pass an existing `id` to update a run (e.g. End of Chat after start).
 */
export function saveChatToHistory(partial) {
  const list = readAll();
  const id = partial.id || newId();
  const entry = buildChatSnapshot({ ...partial, id });

  const without = list.filter((e) => e.id !== id);
  const next = [entry, ...without].slice(0, MAX_ENTRIES);
  writeAll(next);
  return entry;
}

export function removeChatFromHistory(id) {
  const next = readAll().filter((e) => e.id !== id);
  writeAll(next);
  return next;
}

export function getChatById(id) {
  return readAll().find((e) => e.id === id) || null;
}

export function createHistoryEntryId() {
  return newId();
}

/** Live / in-progress session mirror (tab scope). */
export function saveActiveChatToSession(partial) {
  try {
    const snapshot = buildChatSnapshot(partial);
    window.sessionStorage.setItem(ACTIVE_NS, JSON.stringify(snapshot));
    return snapshot;
  } catch (err) {
    console.warn('active chat sessionStorage write failed:', err);
    return null;
  }
}

export function loadActiveChatFromSession() {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_NS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return buildChatSnapshot(parsed);
  } catch (err) {
    console.warn('active chat sessionStorage read failed:', err);
    return null;
  }
}

export function clearActiveChatSession() {
  try {
    window.sessionStorage.removeItem(ACTIVE_NS);
  } catch (err) {
    console.warn('active chat sessionStorage clear failed:', err);
  }
}
