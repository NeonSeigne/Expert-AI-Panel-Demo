import React, { useCallback, useState } from 'react';
import Header from './components/Header';
import ParticipantSidebar from './components/ParticipantSidebar';
import ChatArea from './components/ChatArea';
import AppModals from './AppModals';
import { useChatSession } from './context/ChatSessionContext';

const SIDEBAR_COLLAPSED_KEY = 'ccai-sidebar-collapsed';
const SIDEBAR_WIDTH_KEY = 'ccai-sidebar-width';
const TUTORIAL_SEEN_KEY = 'ccai-tutorial-seen';
const SIDEBAR_DEFAULT_WIDTH = 272;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;

function readSidebarCollapsed() {
  try {
    return sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function clampSidebarWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(n)));
}

function readSidebarWidth() {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw == null) return SIDEBAR_DEFAULT_WIDTH;
    return clampSidebarWidth(raw);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function hasSeenTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export default function AppShell() {
  const { isRunning, hasContent } = useChatSession();
  const showCenteredComposer = !isRunning && !hasContent;
  const [autoTutorialPending, setAutoTutorialPending] = useState(() => !hasSeenTutorial());
  const [tutorialForced, setTutorialForced] = useState(false);
  const showOnboarding = tutorialForced
    || (autoTutorialPending && !isRunning && !hasContent);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }, []);

  const handleSidebarWidthChange = useCallback((nextWidth) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    try {
      sessionStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const handleDismissOnboarding = useCallback(() => {
    markTutorialSeen();
    setAutoTutorialPending(false);
    setTutorialForced(false);
  }, []);

  const handleOpenTutorial = useCallback(() => {
    setTutorialForced(true);
  }, []);

  return (
    <div className="app flex h-full min-h-[100dvh] w-full flex-col overflow-hidden">
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onOpenTutorial={handleOpenTutorial}
      />
      <main className="app-main flex min-h-0 w-full flex-1 overflow-hidden">
        <ParticipantSidebar
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          onWidthChange={handleSidebarWidthChange}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={SIDEBAR_MAX_WIDTH}
        />
        <div className="content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatArea showCenteredComposer={showCenteredComposer} />
        </div>
      </main>
      <footer className="app-footer w-full shrink-0 border-t border-border-primary px-6 py-2 text-center text-xs text-text-muted">
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
      <AppModals
        showOnboarding={showOnboarding}
        onDismissOnboarding={handleDismissOnboarding}
      />
    </div>
  );
}
