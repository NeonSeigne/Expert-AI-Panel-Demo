import React from 'react';
import { UserPlus, UserCheck, Table2 } from 'lucide-react';
import AuthBadge from './AuthBadge';
import ParticipantDropdown from './ParticipantDropdown';
import DownloadMenu from './DownloadMenu';
import DevMenu from './DevMenu';
import HeaderMoreMenu from './HeaderMoreMenu';

function HumanParticipantButton({ humanParticipant, onOpenHumanModal, className }) {
  return (
    <button
      type="button"
      className={
        'btn-sm btn-outline ccai-human-add-btn header-actions-desktop'
        + (className ? ` ${className}` : '')
        + (humanParticipant ? ' ccai-human-add-btn-active' : '')
      }
      onClick={onOpenHumanModal}
      title={humanParticipant
        ? `Edit ${humanParticipant.name}'s credential summary`
        : 'Add a human participant to the conversation'}
    >
      {humanParticipant ? (
        <>
          <UserCheck size={14} style={{ marginRight: 4 }} />
          {humanParticipant.name}
        </>
      ) : (
        <>
          <UserPlus size={14} style={{ marginRight: 4 }} />
          Add a Human Participant
        </>
      )}
    </button>
  );
}

function TableViewButton({ hasChat, onShowTableView, className }) {
  return (
    <button
      type="button"
      className={
        'btn-sm btn-outline ccai-table-view-btn header-actions-desktop'
        + (className ? ` ${className}` : '')
      }
      onClick={onShowTableView}
      disabled={!hasChat}
      title={hasChat
        ? 'Open the conversation summary table'
        : 'Start a chat to view the summary table'}
    >
      <Table2 size={14} style={{ marginRight: 4 }} />
      Table View
    </button>
  );
}

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

  catalog,
  expertPersonas,
  selectedIds,
  maxParticipants,
  onToggleParticipant,
  onOpenExpertModal,
  autoSelectMode,
  onToggleAutoSelectMode,
  humanParticipant,
  onOpenHumanModal,

  // Models / display
  allModels,
  orchestratorModel,
  onOrchestratorChange,
  summarizerModel,
  onSummarizerChange,
  speedPriority,
  onSpeedPriorityChange,
  conversationFormats,
  conversationStructureId,
  onConversationStructureChange,
  decisionMethodId,
  onDecisionMethodChange,
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
        <HumanParticipantButton
          humanParticipant={humanParticipant}
          onOpenHumanModal={onOpenHumanModal}
        />
        <TableViewButton
          hasChat={hasChat}
          onShowTableView={onShowTableView}
        />
        <HeaderMoreMenu
          humanParticipant={humanParticipant}
          onOpenHumanModal={onOpenHumanModal}
          hasChat={hasChat}
          onShowTableView={onShowTableView}
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
          speedPriority={speedPriority}
          onSpeedPriorityChange={onSpeedPriorityChange}
          conversationFormats={conversationFormats}
          conversationStructureId={conversationStructureId}
          onConversationStructureChange={onConversationStructureChange}
          decisionMethodId={decisionMethodId}
          onDecisionMethodChange={onDecisionMethodChange}
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
        />
        <AuthBadge auth={auth} />
      </div>
    </header>
  );
}
