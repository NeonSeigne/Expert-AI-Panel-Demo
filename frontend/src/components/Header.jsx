import React, { useState } from 'react';
import DevMenu from './DevMenu';
import DemoAboutModal from './DemoAboutModal';
import NeonDesignRoot from './NeonDesignRoot';
import '../neon/neon-material.register.js';
import { useChatSession } from '../context/ChatSessionContext';

const BOOK_A_CALL_URL = 'https://www.neon.ai/contact';

function BookACallButton() {
  return (
    <md-filled-button
      className="header-book-call-btn"
      trailing-icon
      aria-label="Book a Call"
      title="Book a Call with Co-Panel"
      onClick={() => {
        window.open(BOOK_A_CALL_URL, '_blank', 'noopener,noreferrer');
      }}
    >
      Book a Call
      <md-icon slot="icon">north_east</md-icon>
    </md-filled-button>
  );
}

function TableViewButton() {
  const { hasChat, handleShowTableView } = useChatSession();
  return (
    <md-outlined-button
      className="header-table-view-btn header-actions-desktop"
      onClick={handleShowTableView}
      disabled={!hasChat || undefined}
      title={hasChat
        ? 'Open the conversation summary table'
        : 'Start a chat to view the summary table'}
    >
      <md-icon slot="icon">table_chart</md-icon>
      Table View
    </md-outlined-button>
  );
}

function TableViewIconButton() {
  const { hasChat, handleShowTableView } = useChatSession();
  return (
    <md-icon-button
      className="header-icon-btn header-actions-mobile"
      onClick={handleShowTableView}
      disabled={!hasChat || undefined}
      aria-label="Table view"
      title={hasChat
        ? 'Open the conversation summary table'
        : 'Start a chat to view the summary table'}
    >
      <md-icon>table_chart</md-icon>
    </md-icon-button>
  );
}

export default function Header({
  navExpanded = true,
  compactNav = false,
  onToggleSidebar,
  onOpenTutorial,
}) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const menuLabel = compactNav
    ? (navExpanded ? 'Close navigation' : 'Open navigation')
    : (navExpanded ? 'Collapse sidebar' : 'Expand sidebar');

  return (
    <>
      <header className="app-header">
        <NeonDesignRoot className="app-header-md">
          <div className="header-left">
            <md-icon-button
              className="header-icon-btn header-menu-btn"
              aria-label={menuLabel}
              title={menuLabel}
              aria-expanded={navExpanded}
              aria-controls="participant-sidebar"
              onClick={onToggleSidebar}
            >
              <md-icon>{compactNav && navExpanded ? 'close' : 'menu'}</md-icon>
            </md-icon-button>
            <a href="https://www.neon.ai/" target="_blank" rel="noopener noreferrer" className="header-brand-link">
              <img src="/neon-logo.png" alt="Co-Panel" className="app-logo" />
            </a>
            <h1 className="app-title md-typescale-title-large">Co-Panel</h1>
          </div>
          <div className="header-right">
            <md-text-button
              className="header-tutorial-btn header-actions-desktop"
              aria-label="Tutorial"
              title="Open the welcome tutorial"
              onClick={onOpenTutorial}
            >
              Tutorial
            </md-text-button>
            <md-icon-button
              className="header-icon-btn header-tutorial-btn header-actions-mobile"
              aria-label="Tutorial"
              title="Open the welcome tutorial"
              onClick={onOpenTutorial}
            >
              <md-icon>school</md-icon>
            </md-icon-button>
            <TableViewButton />
            <TableViewIconButton />
            <md-icon-button
              className="header-icon-btn"
              aria-label="About this demo"
              title="About this demo"
              onClick={() => setAboutOpen(true)}
            >
              <md-icon>help</md-icon>
            </md-icon-button>
            <DevMenu />
            <BookACallButton />
          </div>
        </NeonDesignRoot>
      </header>
      <DemoAboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
