import React, { useCallback, useRef, useState } from 'react';
import {
  isProjectDocumentsAtBudget,
  MAX_PROJECT_DOC_CHARS,
  MAX_PROJECT_FILE_BYTES,
  PROJECT_DOC_ACCEPT,
  processProjectDocumentFiles,
} from '../utils/projectDocuments';

const BUDGET_FULL_MESSAGE =
  'Project documents are at the ~2.5MB limit. Remove a document before adding more.';

const SUCCESS_ROW_MS = 1200;

function uploadMetaLabel(item) {
  if (item.status === 'uploading') return 'Uploading…';
  if (item.status === 'success') return 'Added';
  if (item.status === 'failed') {
    return item.reason ? `Failed upload — ${item.reason}` : 'Failed upload';
  }
  return '';
}

/**
 * Welcome / empty-composer surface for listing and managing project documents.
 * Placed below Ideation rounds; primary manage UX (not composer chips).
 */
export default function ProjectDocumentsSection({
  documents = [],
  onRemove,
  onAdd,
  getExistingDocs,
  disabled = false,
  onBusyChange,
}) {
  const fileInputRef = useRef(null);
  const successTimersRef = useRef(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadItems, setUploadItems] = useState([]);

  const atCap = isProjectDocumentsAtBudget(documents);
  const canUpload = !disabled && !busy && !atCap;
  const hasDocs = (documents?.length || 0) > 0;
  const hasUploadRows = uploadItems.length > 0;

  const setBusyState = useCallback((next) => {
    setBusy(next);
    onBusyChange?.(next);
  }, [onBusyChange]);

  const dismissUploadItem = useCallback((id) => {
    const timer = successTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      successTimersRef.current.delete(id);
    }
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const patchUploadItem = useCallback((evt) => {
    setUploadItems((prev) => {
      const idx = prev.findIndex((item) => item.id === evt.id);
      if (idx === -1) {
        return [...prev, {
          id: evt.id,
          name: evt.name,
          status: evt.status,
          reason: evt.reason || '',
        }];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        name: evt.name || next[idx].name,
        status: evt.status,
        reason: evt.reason || '',
      };
      return next;
    });

    if (evt.status === 'success') {
      const timer = setTimeout(() => {
        successTimersRef.current.delete(evt.id);
        setUploadItems((prev) => prev.filter((item) => item.id !== evt.id));
      }, SUCCESS_ROW_MS);
      successTimersRef.current.set(evt.id, timer);
    }
  }, []);

  const openPicker = useCallback(() => {
    if (!canUpload) {
      if (atCap) setMessage(BUDGET_FULL_MESSAGE);
      return;
    }
    fileInputRef.current?.click();
  }, [canUpload, atCap]);

  const handleFiles = useCallback(async (e) => {
    // Snapshot before clearing — FileList is live and empties when value is reset.
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setBusyState(true);
    setMessage('');
    try {
      // Keep a live list so multi-file budget checks stay accurate.
      let live = typeof getExistingDocs === 'function'
        ? [...(getExistingDocs() || [])]
        : [...(documents || [])];

      const { messages } = await processProjectDocumentFiles(files, {
        getExistingDocs: () => live,
        onFileStatus: patchUploadItem,
        tryAdd: (doc) => {
          const result = onAdd?.(doc);
          if (result?.ok) {
            const nextDoc = result.doc || doc;
            live = [...live, nextDoc];
          }
          return result || { ok: false, reason: 'Could not add document.' };
        },
      });
      // Warnings (e.g. truncated text) still surface globally; failures use rows.
      const warnings = (messages || []).filter((m) => /was long|truncated/i.test(m));
      if (warnings.length) setMessage(warnings.join(' '));
    } finally {
      setBusyState(false);
    }
  }, [documents, getExistingDocs, onAdd, patchUploadItem, setBusyState]);

  return (
    <section
      className="chat-project-documents"
      aria-label="Project documents"
    >
      <h3 className="chat-project-documents-title md-typescale-title-small">
        Project Documents
      </h3>
      <p className="chat-project-documents-hint md-typescale-body-small">
        Shared with every expert each turn
        {' '}· ~2.5MB total · {MAX_PROJECT_DOC_CHARS.toLocaleString()} chars each
        {' '}· {(MAX_PROJECT_FILE_BYTES / 1_000_000).toFixed(0)}MB/file
      </p>

      {!hasDocs && !hasUploadRows ? (
        <p className="chat-project-documents-empty md-typescale-body-small">
          No project documents yet
        </p>
      ) : (
        <ul className="ccai-docs-list chat-project-documents-list">
          {documents.map((d) => (
            <li key={d.id} className="ccai-docs-list-item">
              <div className="ccai-docs-list-main">
                <div className="ccai-docs-list-name" title={d.name}>{d.name}</div>
                <div className="ccai-docs-list-meta">
                  {(d.text || '').length.toLocaleString()} characters
                </div>
              </div>
              <button
                type="button"
                className="chat-project-documents-remove"
                onClick={() => onRemove?.(d.id)}
                disabled={disabled || busy || undefined}
                aria-label={`Remove ${d.name}`}
              >
                Remove
              </button>
            </li>
          ))}
          {uploadItems.map((item) => (
            <li
              key={item.id}
              className={`ccai-docs-list-item ccai-docs-list-item--upload${
                item.status === 'failed' ? ' ccai-docs-list-item--failed' : ''
              }`}
            >
              <div className="ccai-docs-list-main">
                <div className="ccai-docs-list-name" title={item.name}>{item.name}</div>
                <div
                  className={`ccai-docs-list-meta${
                    item.status === 'failed' ? ' ccai-docs-list-meta--failed' : ''
                  }`}
                  role={item.status === 'failed' ? 'alert' : 'status'}
                >
                  {uploadMetaLabel(item)}
                </div>
              </div>
              {item.status === 'failed' ? (
                <button
                  type="button"
                  className="chat-project-documents-remove"
                  onClick={() => dismissUploadItem(item.id)}
                  aria-label={`Dismiss failed upload ${item.name}`}
                >
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className="chat-project-documents-error" role="alert">{message}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={PROJECT_DOC_ACCEPT}
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
        aria-hidden
      />
      <button
        type="button"
        className="chat-project-documents-add"
        onClick={openPicker}
        disabled={!canUpload || undefined}
      >
        {busy ? 'Uploading…' : 'Add documents'}
      </button>
    </section>
  );
}
