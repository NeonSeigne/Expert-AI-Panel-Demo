/**
 * Client-side chat / project history for Co-Panel.
 *
 * Separate localStorage key from prefs (`ccai-vibe-demo`) so large
 * transcripts don't risk corrupting settings on quota pressure.
 *
 * Finished projects are stored as self-contained JSON snapshots so the
 * UI (transcript + wrap-up) can restore without a live backend session.
 */

const NS = 'ccai-chat-history';
const ACTIVE_NS = 'ccai-active-chat';
const MAX_ENTRIES = 20;
const SNAPSHOT_VERSION = 3;

/** Cap extracted text stored per project document (chars). */
export const MAX_PROJECT_DOC_CHARS = 50_000;

/** Soft total budget for serialized projectDocuments (~2.5MB). */
export const PROJECT_DOCS_SOFT_BUDGET_BYTES = Math.floor(2.5 * 1024 * 1024);

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
    return { ok: true };
  } catch (err) {
    console.warn('chat history write failed:', err);
    return { ok: false, error: err };
  }
}

/**
 * Truncate document text to the per-doc storage cap.
 */
export function capDocumentText(text, max = MAX_PROJECT_DOC_CHARS) {
  const raw = typeof text === 'string' ? text : '';
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

/**
 * Normalize a project document for snapshots / attachment injection.
 */
export function normalizeProjectDocument(doc = {}) {
  const name = (doc.name || 'document').trim().slice(0, 200) || 'document';
  const text = capDocumentText(doc.text || '');
  const id = doc.id || `pdoc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { id, name, text };
}

/**
 * Estimate serialized size of projectDocuments (bytes).
 */
export function estimateProjectDocumentsBytes(docs) {
  try {
    return new Blob([JSON.stringify(docs || [])]).size;
  } catch {
    return (docs || []).reduce(
      (n, d) => n + ((d.text || '').length + (d.name || '').length + 32),
      0,
    );
  }
}

/**
 * Check whether adding `nextDoc` stays under the soft project-docs budget.
 */
export function canAddProjectDocument(existing, nextDoc) {
  const normalized = normalizeProjectDocument(nextDoc);
  const candidate = [...(existing || []), normalized];
  const bytes = estimateProjectDocumentsBytes(candidate);
  if (bytes > PROJECT_DOCS_SOFT_BUDGET_BYTES) {
    return {
      ok: false,
      reason:
        'Project documents are at the ~2.5MB limit. '
        + 'Remove a document before adding more.',
      bytes,
    };
  }
  return { ok: true, doc: normalized, bytes };
}

/**
 * Normalize projectDocuments list from a snapshot / modal.
 */
export function normalizeProjectDocuments(docs) {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((d) => d && (d.text || '').trim())
    .map((d) => normalizeProjectDocument(d));
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
  const projectName = typeof partial.projectName === 'string'
    ? partial.projectName.trim()
    : '';
  const projectDocuments = normalizeProjectDocuments(partial.projectDocuments);

  return {
    version: SNAPSHOT_VERSION,
    id: partial.id || null,
    savedAt: partial.savedAt || Date.now(),
    finished: Boolean(partial.finished),
    question: (partial.question || '').trim(),
    projectName,
    projectDocuments,
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
  const result = writeAll(next);
  if (!result.ok) {
    // Retry once without bulky project doc text if quota pressure.
    const slimDocs = (entry.projectDocuments || []).map((d) => ({
      ...d,
      text: capDocumentText(d.text, Math.min(MAX_PROJECT_DOC_CHARS, 8_000)),
    }));
    const slimEntry = { ...entry, projectDocuments: slimDocs };
    const slimNext = [slimEntry, ...without].slice(0, MAX_ENTRIES);
    writeAll(slimNext);
    return slimEntry;
  }
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
