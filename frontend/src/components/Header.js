import React from 'react';
import { Sun, Moon } from 'lucide-react';
import AuthBadge from './AuthBadge';
import ParticipantDropdown from './ParticipantDropdown';
import DevMenu from './DevMenu';

/**
 * Header bar: brand on the left; on the right, participant dropdown,
 * settings, exports, table-view toggle, and the rate-limit-aware auth
 * badge.
 */
export default function Header({
  theme,
  onToggleTheme,
  auth,
  dailyLimit,

  catalog,
  expertPersonas,
  selectedIds,
  maxParticipants,
  onToggleParticipant,
  onOpenExpertModal,
  autoSelectMode,
  onToggleAutoSelectMode,

  // dev menu props passed straight through
  ...devProps
}) {
  return (
    <header className="app-header">
      <div className="header-left">
        <a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="header-brand-link">
          <img src="/neon-logo.png" alt="Neon.ai" className="app-logo" />
        </a>
        <h1 className="app-title">
          <a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="app-title-link">
            Neon.ai
          </a> - Collaborative Conversational AI (CCAI) Demo
        </h1>
      </div>
      <div className="header-right">
        <AuthBadge auth={auth} dailyLimit={dailyLimit} />
        <ParticipantDropdown
          catalog={catalog}
          expertPersonas={expertPersonas}
          selectedIds={selectedIds}
          maxParticipants={maxParticipants}
          onToggleParticipant={onToggleParticipant}
          onOpenExpertModal={onOpenExpertModal}
          autoSelectMode={autoSelectMode}
          onToggleAutoSelectMode={onToggleAutoSelectMode}
        />
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title="Toggle theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <DevMenu
          {...devProps}
          onOpenExpertModal={onOpenExpertModal}
        />
      </div>
    </header>
  );
}
