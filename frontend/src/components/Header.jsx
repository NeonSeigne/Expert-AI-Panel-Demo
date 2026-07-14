import React, { useState } from 'react';
import { Table2 } from 'lucide-react';
import DevMenu from './DevMenu';
import DemoAboutModal from './DemoAboutModal';
import NeonDesignRoot from './NeonDesignRoot';
import '../neon/neon-material.register.js';
import { useChatSession } from '../context/ChatSessionContext';

function TableViewButton() {
  const { hasChat, handleShowTableView } = useChatSession();
  return (
    <md-outlined-button
      className="header-table-view-btn header-actions-desktop"
      onClick={handleShowTableView}
      disabled={!hasChat}
      title={hasChat
        ? 'Open the conversation summary table'
        : 'Start a chat to view the summary table'}
    >
      <Table2 size={16} strokeWidth={2} slot="icon" aria-hidden />
      Table View
    </md-outlined-button>
  );
}

export default function Header({
  sidebarCollapsed = false,
  onToggleSidebar,
  onOpenTutorial,
}) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <header className="app-header">
      <NeonDesignRoot className="app-header-md">
        <div className="header-left">
          <md-icon-button
            className="header-icon-btn header-menu-btn"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-controls="participant-sidebar"
            onClick={onToggleSidebar}
          >
            <md-icon>menu</md-icon>
          </md-icon-button>
          <a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="header-brand-link">
            <img src="/neon-logo.png" alt="Neon.ai" className="app-logo" />
          </a>
          <h1 className="app-title">Collaborative Conversational Artificial Intelligence</h1>
        </div>
        <div className="header-right">
          <md-text-button
            className="header-tutorial-btn"
            aria-label="Tutorial"
            title="Open the welcome tutorial"
            onClick={onOpenTutorial}
          >
            Tutorial
          </md-text-button>
          <TableViewButton />
          <md-icon-button
            className="header-icon-btn"
            aria-label="About this demo"
            title="About this demo"
            onClick={() => setAboutOpen(true)}
          >
            <md-icon>help</md-icon>
          </md-icon-button>
          <DevMenu />
        </div>
      </NeonDesignRoot>
      <DemoAboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
