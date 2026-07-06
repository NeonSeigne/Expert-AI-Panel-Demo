import React from 'react';
import { UserPlus, UserCheck, Table2 } from 'lucide-react';
import AuthBadge from './AuthBadge';
import ParticipantDropdown from './ParticipantDropdown';
import DownloadMenu from './DownloadMenu';
import DevMenu from './DevMenu';
import HeaderMoreMenu from './HeaderMoreMenu';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';

function HumanParticipantButton() {
  const { humanParticipant, handleOpenHumanModal } = useParticipants();
  return (
    <button
      type="button"
      className={
        'btn-sm btn-outline ccai-human-add-btn header-actions-desktop'
        + (humanParticipant ? ' ccai-human-add-btn-active' : '')
      }
      onClick={handleOpenHumanModal}
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

function TableViewButton() {
  const { hasChat, handleShowTableView } = useChatSession();
  return (
    <button
      type="button"
      className="btn-sm btn-outline ccai-table-view-btn header-actions-desktop"
      onClick={handleShowTableView}
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

export default function Header() {
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
        <ParticipantDropdown />
        <HumanParticipantButton />
        <TableViewButton />
        <HeaderMoreMenu />
        <DownloadMenu />
        <DevMenu />
        <AuthBadge />
      </div>
    </header>
  );
}
