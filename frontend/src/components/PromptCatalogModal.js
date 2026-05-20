import React, { useMemo, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';

/**
 * Transparency modal that surfaces every prompt template the
 * orchestrator and participants use during a chat, grouped by phase.
 * Each item shows a humanized title, a 1-2 sentence purpose, the
 * runtime template variables the backend interpolates, and the full
 * template in a copy-able <pre> block. A "Download as .txt" button
 * in the header dumps the whole catalog in a flat human-readable form.
 *
 * Same shell pattern as ConversationLimitsModal / CredentialSummaryModal.
 */
export default function PromptCatalogModal({
  isOpen,
  catalog,
  onClose,
}) {
  // Note: hooks must run on every render, so this filename memo lives
  // ABOVE the `if (!isOpen) return null` early return. The dependency
  // on `isOpen` makes the filename timestamp regenerate each time the
  // modal opens (i.e. each download gets a fresh stamp).
  const filename = useMemo(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      'ccai-prompts-'
      + `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
      + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      + '.txt'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!catalog) return;
    const txt = renderCatalogAsText(catalog);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Current chat prompts</h2>
            <div className="ccai-credentials-subtitle">
              Every prompt template the orchestrator and participants
              use during a chat, in conversation order. Variables in
              {' '}<code>{'{braces}'}</code> are filled in at runtime.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          <button
            className="btn-sm btn-outline"
            onClick={handleDownload}
            disabled={!catalog}
            title="Download the full catalog as a .txt file"
          >
            <Download size={14} style={{ marginRight: 4 }} />
            Download as .txt
          </button>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ccai-credentials-body">
          {!catalog && (
            <div className="ccai-credentials-empty">Loading prompts...</div>
          )}
          {catalog && (catalog.groups || []).map((g) => (
            <div key={g.title} className="ccai-prompt-group">
              <div className="ccai-prompt-group-title">{g.title}</div>
              {(g.items || []).map((item) => (
                <PromptItem key={item.name} item={item} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptItem({ item }) {
  const [copied, setCopied] = useState(false);
  const displayName = humanizeName(item.name);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.template || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  };

  return (
    <div className="ccai-prompt-item">
      <div className="ccai-prompt-item-head">
        <div className="ccai-prompt-item-title">{displayName}</div>
        <button
          className="ccai-prompt-copy-btn"
          onClick={handleCopy}
          title="Copy template to clipboard"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="ccai-prompt-purpose">{item.purpose}</div>
      {item.variables && item.variables.length > 0 && (
        <div className="ccai-prompt-vars">
          <strong>Variables:</strong>{' '}
          {item.variables.map((v, i) => (
            <span key={v}>
              <code>{`{${v}}`}</code>
              {i < item.variables.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      )}
      <pre className="ccai-prompt-template">{item.template}</pre>
    </div>
  );
}

/**
 * "INITIAL_OPINION_PROMPT" -> "Initial Opinion Prompt".
 * Splits on underscores, lowercases everything, capitalizes each word.
 * Drops nothing (e.g. "Prompt" suffix stays) so the displayed name
 * still matches the constant a developer might grep for.
 */
function humanizeName(name) {
  if (!name) return '';
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Flat human-readable .txt dump used by the Download button. Matches
 * the spec format: title banner, per-group separator, per-item header
 * with purpose + variables, then the indented template body.
 */
function renderCatalogAsText(catalog) {
  const now = new Date().toISOString();
  const lines = [];
  const banner = '═'.repeat(64);
  lines.push(banner);
  lines.push('CCAI Vibe Demo — Current chat prompts');
  lines.push(`Generated: ${now}`);
  lines.push(banner);
  lines.push('');

  for (const group of catalog.groups || []) {
    const sep = '─'.repeat(12);
    lines.push(`${sep} ${group.title} ${sep}`);
    lines.push('');
    for (const item of (group.items || [])) {
      lines.push(`## ${humanizeName(item.name)}`);
      lines.push(`Purpose: ${item.purpose}`);
      if (item.variables && item.variables.length > 0) {
        lines.push(
          'Variables: '
          + item.variables.map(v => `{${v}}`).join(', '),
        );
      }
      lines.push('');
      // Indent each template line by 4 spaces so the body is
      // visually distinct from the metadata in a plain-text viewer.
      for (const ln of (item.template || '').split('\n')) {
        lines.push('    ' + ln);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
