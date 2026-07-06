import React from 'react';
import Header from './components/Header';
import ParticipantSidebar from './components/ParticipantSidebar';
import ChatControls from './components/ChatControls';
import ChatArea from './components/ChatArea';
import AppModals from './AppModals';

export default function AppShell() {
  return (
    <div className="app flex h-screen flex-col overflow-hidden">
      <Header />
      <main className="app-main flex min-h-0 flex-1 overflow-hidden">
        <ParticipantSidebar />
        <div className="content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatControls />
          <ChatArea />
        </div>
      </main>
      <footer className="app-footer shrink-0 border-t border-border-primary px-6 py-2 text-center text-xs text-text-muted">
        Copyright Neon.ai. All rights reserved.{' '}
        <a
          href="https://www.neon.ai/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary hover:underline"
        >
          Patents and licensing
        </a>
      </footer>
      <AppModals />
    </div>
  );
}
