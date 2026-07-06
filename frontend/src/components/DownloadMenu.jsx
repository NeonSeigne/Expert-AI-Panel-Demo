import React, { useEffect, useRef, useState } from 'react';
import { Download, Table2, FileText, FileCode, FileSpreadsheet, History } from 'lucide-react';
import { useChatSession } from '../context/ChatSessionContext';

export default function DownloadMenu() {
  const {
    hasChat,
    hasApiLog,
    handleShowTableView,
    handleDownloadTxt,
    handleDownloadMd,
    handleDownloadCsvTable,
    handleDownloadApiLog,
  } = useChatSession();

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
              onClick={fire(handleShowTableView)}
              title="Open the conversation summary table"
            >
              <Table2 size={14} className="dev-check-icon" />
              Summary table…
            </button>

            <div className="dev-panel-divider" />
            <div className="dev-panel-label">Downloads</div>
            <button className="dev-panel-row" disabled={!hasChat} onClick={fire(handleDownloadTxt)}>
              <FileText size={14} className="dev-check-icon" />
              Chat as .txt
            </button>
            <button className="dev-panel-row" disabled={!hasChat} onClick={fire(handleDownloadMd)}>
              <FileCode size={14} className="dev-check-icon" />
              Chat as .md
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(handleDownloadCsvTable)}
              title="Download the summary table as CSV"
            >
              <FileSpreadsheet size={14} className="dev-check-icon" />
              Summary table as .csv
            </button>
            <button
              className="dev-panel-row"
              disabled={!hasApiLog}
              onClick={fire(handleDownloadApiLog)}
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
