import React, { useCallback, useEffect, useState } from 'react';
import MdDialog from './md/MdDialog';
import {
  listPersonaDocuments,
  uploadPersonaDocument,
  addPersonaDocumentText,
  deletePersonaDocument,
} from '../utils/api';
import '../neon/neon-material.register.js';

/**
 * Manage per-persona RAG documents stored on the backend.
 */
export default function ManageDocumentsModal({
  isOpen,
  participant,
  onClose,
}) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);

  const pid = participant?.participant_id;

  const refresh = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    setError('');
    try {
      const data = await listPersonaDocuments(pid);
      setDocs(data.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    if (!isOpen || !pid) return;
    refresh();
  }, [isOpen, pid, refresh]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pid) return;
    setBusy(true);
    setError('');
    try {
      await uploadPersonaDocument(pid, file);
      await refresh();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }, [pid, refresh]);

  const handlePaste = useCallback(async () => {
    if (!pid || !pasteText.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addPersonaDocumentText(pid, {
        name: pasteName.trim() || 'Pasted note',
        text: pasteText,
      });
      setPasteName('');
      setPasteText('');
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to add note');
    } finally {
      setBusy(false);
    }
  }, [pid, pasteName, pasteText, refresh]);

  const handleDelete = useCallback(async (docId) => {
    if (!pid) return;
    setBusy(true);
    setError('');
    try {
      await deletePersonaDocument(pid, docId);
      await refresh();
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }, [pid, refresh]);

  const title = participant?.name
    ? `Documents — ${participant.name}`
    : 'Manage Documents';

  return (
    <MdDialog
      open={Boolean(isOpen && participant)}
      onClose={onClose}
      size="large"
      headline={title}
      actions={(
        <>
          <span style={{ flex: 1 }} />
          <md-filled-button type="button" onClick={onClose}>
            Done
          </md-filled-button>
        </>
      )}
    >
      <p className="md-typescale-body-medium" style={{ marginTop: 0 }}>
        Documents are stored in this persona&apos;s RAG database on the server.
        Enable <strong>Documents</strong> in the detail pane to use them on turns.
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--error, #b3261e)' }}>{error}</p>
      )}

      <div className="ccai-docs-modal-section">
        <h4 className="md-typescale-title-small" style={{ margin: '0 0 0.5rem' }}>
          Uploaded
        </h4>
        {loading ? (
          <p className="md-typescale-body-small">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="md-typescale-body-small" style={{ color: 'var(--text-muted)' }}>
            No documents yet.
          </p>
        ) : (
          <ul className="ccai-docs-list">
            {docs.map((d) => (
              <li key={d.id} className="ccai-docs-list-item">
                <div className="ccai-docs-list-main">
                  <div className="ccai-docs-list-name" title={d.name}>{d.name}</div>
                  <div className="ccai-docs-list-meta">
                    {d.chunk_count || 0} chunk{(d.chunk_count || 0) === 1 ? '' : 's'}
                  </div>
                </div>
                <md-text-button
                  type="button"
                  onClick={() => handleDelete(d.id)}
                  disabled={busy || undefined}
                >
                  Remove
                </md-text-button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ccai-docs-modal-section">
        <h4 className="md-typescale-title-small" style={{ margin: '0 0 0.5rem' }}>
          Upload file
        </h4>
        <p className="md-typescale-body-small" style={{ marginTop: 0 }}>
          .txt, .md, .pdf, or .docx (max 5MB)
        </p>
        <input
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,text/x-markdown,application/pdf"
          onChange={handleFile}
          disabled={busy}
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
            rows={5}
            placeholder="Paste notes, guidelines, or reference text…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={busy}
          />
        </label>
        <md-outlined-button
          type="button"
          onClick={handlePaste}
          disabled={busy || !pasteText.trim() || undefined}
          style={{ marginTop: '0.5rem' }}
        >
          Add note
        </md-outlined-button>
      </div>
    </MdDialog>
  );
}
