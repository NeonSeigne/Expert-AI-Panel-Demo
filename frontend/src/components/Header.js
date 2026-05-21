import React from 'react';
import AuthBadge from './AuthBadge';
import ParticipantDropdown from './ParticipantDropdown';
import DownloadMenu from './DownloadMenu';
import DevMenu from './DevMenu';

/**
 * Header bar: brand on the left; on the right, auth badge, participant
 * dropdown, downloads dropdown, settings (gear) dropdown.
 *
 * The standalone Sun/Moon theme toggle that used to live here has moved
 * inside the DevMenu (Theme is the top item in the settings panel).
 *
 * NOTE: every prop that goes to DevMenu is forwarded *explicitly* below
 * (no `...devProps` rest spread). The previous spread pattern hid the
 * `maxParticipants` value because Header destructured it for its own
 * use, which silently stripped it from the spread that fed DevMenu;
 * the Max Participants stepper then received `undefined` and produced
 * NaN on every click, which manifested as "the +/- buttons do nothing".
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

  // Models / display
  allModels,
  orchestratorModel,
  onOrchestratorChange,
  summarizerModel,
  onSummarizerChange,
  showResponseTime,
  onShowResponseTimeChange,
  showChatStats,
  onShowChatStatsChange,
  onMaxParticipantsChange,

  participants,
  modelAssignments,
  onModelAssignmentChange,

  // Modals / transparency
  onShowTableView,
  onShowCredentials,
  hasCredentials,
  onShowPromptCatalog,
  onShowConversationLimits,
  conversationLimitsOverridden,

  // Downloads
  onDownloadChatTxt,
  onDownloadChatMd,
  onDownloadCsvTable,
  onDownloadApiLog,
  hasApiLog,
  hasChat,
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
        <DownloadMenu
          hasChat={hasChat}
          hasApiLog={hasApiLog}
          onShowTableView={onShowTableView}
          onDownloadChatTxt={onDownloadChatTxt}
          onDownloadChatMd={onDownloadChatMd}
          onDownloadCsvTable={onDownloadCsvTable}
          onDownloadApiLog={onDownloadApiLog}
        />
        <DevMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          allModels={allModels}
          orchestratorModel={orchestratorModel}
          onOrchestratorChange={onOrchestratorChange}
          summarizerModel={summarizerModel}
          onSummarizerChange={onSummarizerChange}
          showResponseTime={showResponseTime}
          onShowResponseTimeChange={onShowResponseTimeChange}
          showChatStats={showChatStats}
          onShowChatStatsChange={onShowChatStatsChange}
          maxParticipants={maxParticipants}
          onMaxParticipantsChange={onMaxParticipantsChange}
          participants={participants}
          modelAssignments={modelAssignments}
          onModelAssignmentChange={onModelAssignmentChange}
          onOpenExpertModal={onOpenExpertModal}
          onShowCredentials={onShowCredentials}
          hasCredentials={hasCredentials}
          onShowPromptCatalog={onShowPromptCatalog}
          onShowConversationLimits={onShowConversationLimits}
          conversationLimitsOverridden={conversationLimitsOverridden}
          onDownloadChatTxt={onDownloadChatTxt}
          onDownloadChatMd={onDownloadChatMd}
          onDownloadCsvTable={onDownloadCsvTable}
          hasChat={hasChat}
        />
      </div>
    </header>
  );
}
