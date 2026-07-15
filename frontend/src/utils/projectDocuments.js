import { extractAttachment } from './api';
import {
  canAddProjectDocument,
  capDocumentText,
  estimateProjectDocumentsBytes,
  MAX_PROJECT_DOC_CHARS,
  PROJECT_DOCS_SOFT_BUDGET_BYTES,
} from './chatHistory';

// Re-export so UI modules can import doc caps from one place.
export {
  MAX_PROJECT_DOC_CHARS,
  PROJECT_DOCS_SOFT_BUDGET_BYTES,
  estimateProjectDocumentsBytes,
};

export const MAX_PROJECT_FILE_BYTES = 5_000_000;
export const PROJECT_DOC_ACCEPT =
  '.txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,text/x-markdown,application/pdf';

function newUploadId() {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripLabelPrefix(label, reason) {
  const raw = reason || 'Upload failed';
  const prefix = `${label}: `;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

/**
 * Whether serialized project documents already fill the soft budget.
 */
export function isProjectDocumentsAtBudget(docs) {
  return estimateProjectDocumentsBytes(docs) >= PROJECT_DOCS_SOFT_BUDGET_BYTES;
}

/**
 * Extract + soft-cap one file for a project document (no storage check).
 */
export async function extractProjectDocumentFromFile(
  file,
  { maxFileBytes = MAX_PROJECT_FILE_BYTES } = {},
) {
  const label = file?.name || 'upload';
  if (!file) {
    return { ok: false, reason: 'No file selected.' };
  }
  if (file.size > maxFileBytes) {
    return { ok: false, reason: `${label}: File too large (max 5MB)` };
  }
  try {
    const data = await extractAttachment(file);
    const text = capDocumentText(data.text || '');
    if (!text.trim()) {
      return { ok: false, reason: `${label}: No extractable text in upload.` };
    }
    const truncated = (data.text || '').length > MAX_PROJECT_DOC_CHARS;
    return {
      ok: true,
      doc: {
        name: data.name || label,
        text,
      },
      warning: truncated
        ? `${label}: Extracted text was long; stored the first ${MAX_PROJECT_DOC_CHARS.toLocaleString()} characters.`
        : null,
    };
  } catch (err) {
    return { ok: false, reason: `${label}: ${err.message || 'Upload failed'}` };
  }
}

/**
 * Process one or many files into project documents.
 *
 * @param {FileList|File[]} files
 * @param {object} opts
 * @param {() => object[]} opts.getExistingDocs — live list for budget checks
 * @param {(doc: object) => {ok: boolean, reason?: string, doc?: object}} [opts.tryAdd]
 *   If omitted, uses canAddProjectDocument against getExistingDocs and returns
 *   `{ ok, doc, messages }` for the caller to merge.
 * @param {(status: string) => void} [opts.onProgress]
 * @param {(evt: {id: string, name: string, status: 'uploading'|'success'|'failed', reason?: string}) => void} [opts.onFileStatus]
 * @returns {Promise<{added: object[], messages: string[]}>}
 */
export async function processProjectDocumentFiles(files, {
  getExistingDocs,
  tryAdd,
  onProgress,
  onFileStatus,
} = {}) {
  const list = Array.from(files || []).filter(Boolean);
  const added = [];
  const messages = [];
  if (!list.length) return { added, messages };

  const addOne = (doc) => {
    if (typeof tryAdd === 'function') {
      return tryAdd(doc);
    }
    const existing = typeof getExistingDocs === 'function' ? getExistingDocs() : [];
    const check = canAddProjectDocument(existing, doc);
    if (!check.ok) return check;
    return { ok: true, doc: check.doc };
  };

  for (let i = 0; i < list.length; i += 1) {
    const file = list[i];
    const label = file.name || 'upload';
    const id = newUploadId();
    onProgress?.(`Extracting ${i + 1} of ${list.length}…`);
    onFileStatus?.({ id, name: label, status: 'uploading' });

    const extracted = await extractProjectDocumentFromFile(file);
    if (!extracted.ok) {
      const reason = extracted.reason || `${label}: Upload failed`;
      messages.push(reason);
      onFileStatus?.({
        id,
        name: label,
        status: 'failed',
        reason: stripLabelPrefix(label, reason),
      });
      continue;
    }

    const result = addOne(extracted.doc);
    if (!result?.ok) {
      const reason = result?.reason || 'Could not add document.';
      messages.push(`${label}: ${reason}`);
      onFileStatus?.({ id, name: label, status: 'failed', reason });
      continue;
    }
    added.push(result.doc || extracted.doc);
    onFileStatus?.({ id, name: label, status: 'success' });
    if (extracted.warning) messages.push(extracted.warning);
  }

  onProgress?.('');
  return { added, messages };
}
