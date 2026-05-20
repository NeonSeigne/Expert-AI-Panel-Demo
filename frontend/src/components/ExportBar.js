import React, { useState, useRef, useEffect } from 'react';
import { Download, Settings } from 'lucide-react';
import { exportChat, exportApiLog } from '../utils/api';

export default function ExportBar({ sessionId }) {
  const [devOpen, setDevOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDevOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (fmt) => {
    try {
      const result = await exportChat(sessionId, fmt);
      downloadFile(result.filename, result.content);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleApiLogExport = async () => {
    try {
      const result = await exportApiLog(sessionId);
      downloadFile('api_log.json', JSON.stringify(result, null, 2));
      setDevOpen(false);
    } catch (err) {
      console.error('API log export failed:', err);
    }
  };

  if (!sessionId) return null;

  return (
    <div className="export-bar">
      <button className="btn-secondary" onClick={() => handleExport('txt')}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Download .txt
      </button>
      <button className="btn-secondary" onClick={() => handleExport('md')}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
        Download .md
      </button>

      <div className="dev-dropdown" ref={dropdownRef}>
        <button
          className="icon-btn"
          onClick={() => setDevOpen(o => !o)}
          title="Developer Options"
        >
          <Settings size={16} />
        </button>
        {devOpen && (
          <div className="dev-dropdown-menu">
            <button onClick={handleApiLogExport}>
              Download Full API Log
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
