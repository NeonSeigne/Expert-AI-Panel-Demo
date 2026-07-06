import React from 'react';
import ExpertPersonaModal from './components/ExpertPersonaModal';
import ChatTableView from './components/ChatTableView';
import CredentialSummaryModal from './components/CredentialSummaryModal';
import ConversationLimitsModal from './components/ConversationLimitsModal';
import PromptCatalogModal from './components/PromptCatalogModal';
import HumanParticipantModal from './components/HumanParticipantModal';
import RateLimitNotice from './components/RateLimitNotice';
import { useSettings } from './context/SettingsContext';
import { useParticipants } from './context/ParticipantsContext';
import { useChatSession } from './context/ChatSessionContext';

export default function AppModals() {
  const {
    limitsSchema,
    limitsOverrides,
    limitsOpen,
    setLimitsOpen,
    promptCatalog,
    promptCatalogOpen,
    setPromptCatalogOpen,
    handleConversationLimitsChange,
    handleConversationLimitsResetAll,
  } = useSettings();

  const {
    expertModalOpen,
    expertEditing,
    closeExpertModal,
    handleSaveExpert,
    handleDeleteExpert,
    humanModalOpen,
    humanEditing,
    closeHumanModal,
    handleSaveHuman,
    handleRemoveHuman,
  } = useParticipants();

  const {
    tableOpen,
    tableData,
    setTableOpen,
    credentialsOpen,
    credentialsData,
    setCredentialsOpen,
    handleRefreshCredentials,
    handleEditHumanCredential,
    handleDownloadCsvTable,
  } = useChatSession();

  const { humanParticipant } = useParticipants();

  return (
    <>
      <ExpertPersonaModal
        isOpen={expertModalOpen}
        initial={expertEditing}
        onClose={closeExpertModal}
        onSave={handleSaveExpert}
        onDelete={handleDeleteExpert}
      />
      {tableOpen && (
        <ChatTableView
          data={tableData}
          onClose={() => setTableOpen(false)}
          onExportCsv={handleDownloadCsvTable}
        />
      )}
      <CredentialSummaryModal
        isOpen={credentialsOpen}
        data={credentialsData}
        onClose={() => setCredentialsOpen(false)}
        onRefresh={handleRefreshCredentials}
        humanParticipantId={humanParticipant?.participant_id || null}
        onEditHumanCredential={handleEditHumanCredential}
      />
      <HumanParticipantModal
        isOpen={humanModalOpen}
        initial={humanEditing}
        onClose={closeHumanModal}
        onSave={handleSaveHuman}
        onRemove={humanEditing ? handleRemoveHuman : null}
      />
      <ConversationLimitsModal
        isOpen={limitsOpen}
        schema={limitsSchema}
        overrides={limitsOverrides}
        onClose={() => setLimitsOpen(false)}
        onChange={handleConversationLimitsChange}
        onResetAll={handleConversationLimitsResetAll}
      />
      <PromptCatalogModal
        isOpen={promptCatalogOpen}
        catalog={promptCatalog}
        onClose={() => setPromptCatalogOpen(false)}
      />
      <RateLimitNotice />
    </>
  );
}
