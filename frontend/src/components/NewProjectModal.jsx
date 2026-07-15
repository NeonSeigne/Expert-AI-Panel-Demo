import React, { useCallback, useEffect, useRef, useState } from 'react';
import MdDialog from './md/MdDialog';
import {
  canAddProjectDocument,
  capDocumentText,
  MAX_PROJECT_DOC_CHARS,
} from '../utils/chatHistory';
import {
  isProjectDocumentsAtBudget,
  MAX_PROJECT_FILE_BYTES,
  PROJECT_DOC_ACCEPT,
  processProjectDocumentFiles,
} from '../utils/projectDocuments';
import '../neon/neon-material.register.js';

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
 * Two-step New Project flow: name → optional documents → welcome.
 */
export default function NewProjectModal({
  isOpen,
  onClose,
  onCreate,
}) {
  const [step, setStep] = useState('name'); // 'name' | 'documents'
  const [name, setName] = useState('');
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [uploadItems, setUploadItems] = useState([]);
  const successTimersRef = useRef(new Map());

  useEffect(() => {
    if (!isOpen) return;
    setStep('name');
    setName('');
    setDocs([]);
    setError('');
    setBusy(false);
    setPasteName('');
    setPasteText('');
    setUploadItems([]);
    successTimersRef.current.forEach((timer) => clearTimeout(timer));
    successTimersRef.current.clear();
  }, [isOpen]);

  const finish = useCallback((documents) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required.');
      setStep('name');
      return;
    }
    const result = onCreate?.({ name: trimmed, documents: documents ?? docs });
    if (result && result.ok === false) {
      setError(result.reason || 'Could not create project.');
      return;
    }
  }, [name, docs, onCreate]);

  const handleContinueFromName = useCallback(() => {
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setError('');
    setStep('documents');
  }, [name]);

  const tryAddDoc = useCallback((doc, working) => {
    const list = working || docs;
    const check = canAddProjectDocument(list, doc);
    if (!check.ok) {
      return check;
    }
    return { ok: true, doc: check.doc };
  }, [docs]);

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

  const handleFiles = useCallback(async (e) => {
    // Snapshot before clearing — FileList is live and empties when value is reset.
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    setError('');
    setBusy(true);
    try {
      let live = [...docs];
      const { messages } = await processProjectDocumentFiles(files, {
        getExistingDocs: () => live,
        onFileStatus: patchUploadItem,
        tryAdd: (doc) => {
          const result = tryAddDoc(doc, live);
          if (result.ok) {
            live = [...live, result.doc];
            setDocs(live);
          }
          return result;
        },
      });
      const warnings = (messages || []).filter((m) => /was long|truncated/i.test(m));
      if (warnings.length) setError(warnings.join(' '));
    } finally {
      setBusy(false);
    }
  }, [docs, patchUploadItem, tryAddDoc]);

  const handlePaste = useCallback(() => {
    const text = capDocumentText(pasteText);
    if (!text.trim()) return;
    const warnings = [];
    if ((pasteText || '').length > MAX_PROJECT_DOC_CHARS) {
      warnings.push(
        `Pasted text was long; stored the first ${MAX_PROJECT_DOC_CHARS.toLocaleString()} characters.`,
      );
    }
    const result = tryAddDoc({ name: pasteName.trim() || 'Pasted note', text });
    if (!result.ok) {
      setError(result.reason || 'Document too large for browser storage.');
      return;
    }
    setDocs((prev) => [...prev, result.doc]);
    setPasteName('');
    setPasteText('');
    setError(warnings.join(' '));
  }, [pasteName, pasteText, tryAddDoc]);

  const handleRemove = useCallback((id) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setError('');
  }, []);

  const headline = step === 'name' ? 'New project' : 'Add documents';
  const atCap = isProjectDocumentsAtBudget(docs);

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="standard"
      headline={headline}
      actions={(
        <>
          <md-text-button type="button" onClick={onClose} disabled={busy || undefined}>
            Cancel
          </md-text-button>
          {step === 'name' ? (
            <md-filled-button
              type="button"
              onClick={handleContinueFromName}
              disabled={!name.trim() || busy || undefined}
            >
              Continue
            </md-filled-button>
          ) : (
            <>
              <md-text-button
                type="button"
                onClick={() => finish([])}
                disabled={busy || undefined}
              >
                Skip
              </md-text-button>
              <md-filled-button
                type="button"
                onClick={() => finish(docs)}
                disabled={busy || undefined}
              >
                Done
              </md-filled-button>
            </>
          )}
        </>
      )}
    >
      {step === 'name' && (
        <>
          <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
            Name this project. You can add reference documents next — they stay
            with the project and are shared with every expert each turn.
          </p>
          {error && (
            <p role="alert" style={{ color: 'var(--error, #b3261e)' }}>{error}</p>
          )}
          <md-outlined-text-field
            label="Project name"
            value={name}
            style={{ width: '100%' }}
            autofocus
            onInput={(e) => setName(e.target.value || '')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                e.preventDefault();
                handleContinueFromName();
              }
            }}
          />
        </>
      )}

      {step === 'documents' && (
        <>
          <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
            Optional. Attach briefs, notes, or brand guidelines for
            {' '}<strong>{name.trim()}</strong>. Skip if you want to start empty.
            You can select multiple files at once.
          </p>
          {error && (
            <p role="alert" style={{ color: 'var(--error, #b3261e)' }}>{error}</p>
          )}

          {(docs.length > 0 || uploadItems.length > 0) && (
            <ul className="ccai-docs-list" style={{ marginBottom: '1rem' }}>
              {docs.map((d) => (
                <li key={d.id} className="ccai-docs-list-item">
                  <div className="ccai-docs-list-main">
                    <div className="ccai-docs-list-name" title={d.name}>{d.name}</div>
                    <div className="ccai-docs-list-meta">
                      {(d.text || '').length.toLocaleString()} characters
                    </div>
                  </div>
                  <md-text-button
                    type="button"
                    onClick={() => handleRemove(d.id)}
                    disabled={busy || undefined}
                  >
                    Remove
                  </md-text-button>
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
                    <md-text-button
                      type="button"
                      onClick={() => dismissUploadItem(item.id)}
                    >
                      Dismiss
                    </md-text-button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="ccai-docs-modal-section">
            <h4 className="md-typescale-title-small" style={{ margin: '0 0 0.5rem' }}>
              Upload files
            </h4>
            <p className="md-typescale-body-small" style={{ marginTop: 0 }}>
              .txt, .md, .pdf, or .docx (max {(MAX_PROJECT_FILE_BYTES / 1_000_000).toFixed(0)}MB each;
              text capped at {MAX_PROJECT_DOC_CHARS.toLocaleString()} chars; ~2.5MB total)
            </p>
            <input
              type="file"
              accept={PROJECT_DOC_ACCEPT}
              multiple
              onChange={handleFiles}
              disabled={busy || atCap}
            />
          </div>

          <div className="ccai-docs-modal-section">
            <h4 className="md-typescale-title-small" style={{ margin: '0 0 0.5rem' }}>
              Paste text
            </h4>
            <md-outlined-text-field
              label="Name"
              value={pasteName}
              style={{ width: '100%', marginBottom: '0.5rem' }}
              onInput={(e) => setPasteName(e.target.value || '')}
            />
            <label className="ccai-human-field" style={{ display: 'block', width: '100%' }}>
              <textarea
                className="ccai-docs-paste"
                rows={4}
                placeholder="Paste notes, briefs, or reference text…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                disabled={busy}
              />
            </label>
            <md-outlined-button
              type="button"
              onClick={handlePaste}
              disabled={busy || !pasteText.trim() || atCap || undefined}
              style={{ marginTop: '0.5rem' }}
            >
              Add note
            </md-outlined-button>
          </div>
        </>
      )}
    </MdDialog>
  );
}
