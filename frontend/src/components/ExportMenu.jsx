import React, { useEffect, useId, useRef } from 'react';
import { Download } from 'lucide-react';
import '../neon/neon-material.register.js';
import { useChatSession } from '../context/ChatSessionContext';

const ACTIONS = [
  { value: 'table', label: 'Summary table…', needsChat: true },
  { value: 'txt', label: 'Chat as .txt', needsChat: true },
  { value: 'md', label: 'Chat as .md', needsChat: true },
  { value: 'csv', label: 'Summary table as .csv', needsChat: true },
  { value: 'api', label: 'Full API history', needsApi: true },
];

/**
 * Shared export / downloads control.
 * - variant "button": native <select> (matches main-page Structure/Decision/Rounds)
 * - variant "icon": compact header md-menu
 */
export default function ExportMenu({
  variant = 'icon',
  className = '',
  menuCorner = 'start-end',
  anchorCorner = 'end-end',
}) {
  const {
    hasChat,
    hasApiLog,
    handleShowTableView,
    handleDownloadTxt,
    handleDownloadMd,
    handleDownloadCsvTable,
    handleDownloadApiLog,
  } = useChatSession();

  const anchorId = useId().replace(/:/g, '');
  const selectId = useId().replace(/:/g, '');
  const menuRef = useRef(null);
  const anchorRef = useRef(null);

  useEffect(() => {
    if (variant !== 'icon') return undefined;
    const menu = menuRef.current;
    if (!menu || !anchorRef.current) return undefined;
    menu.anchorElement = anchorRef.current;
    return undefined;
  }, [variant]);

  const runAction = (value) => {
    switch (value) {
      case 'table':
        handleShowTableView?.();
        break;
      case 'txt':
        handleDownloadTxt?.();
        break;
      case 'md':
        handleDownloadMd?.();
        break;
      case 'csv':
        handleDownloadCsvTable?.();
        break;
      case 'api':
        handleDownloadApiLog?.();
        break;
      default:
        break;
    }
  };

  if (variant === 'button') {
    const handleNativeChange = (e) => {
      const next = e?.target?.value ?? '';
      e.target.value = '';
      if (!next) return;
      runAction(next);
    };

    return (
      <div className={`ccai-export-menu ccai-export-menu--native${className ? ` ${className}` : ''}`}>
        <label className="onboarding-form-field-label" htmlFor={selectId}>
          Export
        </label>
        <div className="onboarding-form-select-shell">
          <select
            id={selectId}
            className="onboarding-form-select ccai-export-native-select"
            defaultValue=""
            onChange={handleNativeChange}
            aria-label="Export conversation"
            title="Downloads & exports"
          >
            <option value="" disabled>
              Choose format…
            </option>
            {ACTIONS.map((opt) => {
              const disabled = (opt.needsChat && !hasChat)
                || (opt.needsApi && !hasApiLog);
              return (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={disabled || undefined}
                >
                  {opt.label}
                </option>
              );
            })}
          </select>
          <span className="onboarding-form-select-chevron" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const toggleMenu = () => {
    const menu = menuRef.current;
    if (!menu) return;
    if (menu.open) menu.close();
    else menu.show();
  };

  const run = (fn) => () => {
    fn?.();
    menuRef.current?.close();
  };

  return (
    <div className={`header-menu-anchor ccai-export-menu${className ? ` ${className}` : ''}`}>
      <md-outlined-icon-button
        id={anchorId}
        ref={anchorRef}
        aria-label="Downloads"
        title="Downloads & exports"
        onClick={toggleMenu}
      >
        <Download size={18} strokeWidth={2} aria-hidden />
      </md-outlined-icon-button>
      <md-menu
        ref={menuRef}
        positioning="popover"
        menu-corner={menuCorner}
        anchor-corner={anchorCorner}
      >
        <md-menu-item disabled={!hasChat} onClick={run(handleShowTableView)}>
          <div slot="headline">Summary table…</div>
        </md-menu-item>
        <md-divider />
        <md-menu-item disabled={!hasChat} onClick={run(handleDownloadTxt)}>
          <div slot="headline">Chat as .txt</div>
        </md-menu-item>
        <md-menu-item disabled={!hasChat} onClick={run(handleDownloadMd)}>
          <div slot="headline">Chat as .md</div>
        </md-menu-item>
        <md-menu-item disabled={!hasChat} onClick={run(handleDownloadCsvTable)}>
          <div slot="headline">Summary table as .csv</div>
        </md-menu-item>
        <md-menu-item disabled={!hasApiLog} onClick={run(handleDownloadApiLog)}>
          <div slot="headline">Full API history</div>
        </md-menu-item>
      </md-menu>
    </div>
  );
}
