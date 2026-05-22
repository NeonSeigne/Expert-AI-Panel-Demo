import React, { useEffect, useRef, useState } from 'react';
import { Download, Table2, FileText, FileCode, FileSpreadsheet, History } from 'lucide-react';

/**
 * Header dropdown that consolidates every "view this conversation as…"
 * and "download this conversation as…" action behind a single Download
 * icon. The same chat-as-.txt / .md / .csv items are *also* listed in
 * the Settings menu's Downloads section (intentional duplication, per
 * UX request); the only item that lives *exclusively* here is
 * "Download full API history".
 *
 * Mirrors the open/close + outside-mousedown pattern used by DevMenu so
 * both dropdowns feel and behave identically.
 */
export default function DownloadMenu({
  hasChat,
  hasApiLog,
  onShowTableView,
  onDownloadChatTxt,
  onDownloadChatMd,
  onDownloadCsvTable,
  onDownloadApiLog,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fire = (fn) => () => { fn?.(); setOpen(false); };

  return (
    <div className="dev-wrap" ref={wrapRef}>
      <div className="dev-dropdown-header">
        <button
          className="icon-btn"
          onClick={() => setOpen(o => !o)}
          title="Downloads & exports"
          aria-label="Downloads"
        >
          <Download size={16} />
        </button>
        {open && (
          <div className="dev-panel">
            <div className="dev-panel-label">View</div>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(onShowTableView)}
              title="Open the conversation summary table"
            >
              <Table2 size={14} className="dev-check-icon" />
              Summary table…
            </button>

            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Downloads</div>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(onDownloadChatTxt)}
            >
              <FileText size={14} className="dev-check-icon" />
              Chat as .txt
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(onDownloadChatMd)}
            >
              <FileCode size={14} className="dev-check-icon" />
              Chat as .md
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(onDownloadCsvTable)}
              title="Download the summary table as CSV"
            >
              <FileSpreadsheet size={14} className="dev-check-icon" />
              Summary table as .csv
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasApiLog}
              onClick={fire(onDownloadApiLog)}
              title="Download the full backend API call history for this session"
            >
              <History size={14} className="dev-check-icon" />
              Full API history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
