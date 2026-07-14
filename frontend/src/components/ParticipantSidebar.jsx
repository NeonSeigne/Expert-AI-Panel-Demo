import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Pencil, Plus, Users } from 'lucide-react';
import '../neon/neon-material.register.js';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';
import NeonDesignRoot from './NeonDesignRoot';
import ParticipantSidebarCard from './ParticipantSidebarCard';
import ChatHistoryList from './ChatHistoryList';

export default function ParticipantSidebar({
  collapsed = false,
  width = 272,
  onWidthChange,
  minWidth = 200,
  maxWidth = 480,
}) {
  const { maxParticipants } = useSettings();
  const {
    selectedParticipants: participants,
    enabledMap,
    modelAssignments,
    autoSelectMode,
    handleSidebarToggleEnabled,
    handleSidebarRemove,
    openParticipantDirectory,
    handleOpenHumanModal,
  } = useParticipants();
  const {
    chatHistory,
    activeHistoryId,
    loadHistoryChat,
    deleteHistoryChat,
    handleStartNewChat,
  } = useChatSession();

  const [participantsOpen, setParticipantsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef(null);

  const showAutoPlaceholder = !collapsed && autoSelectMode && participants.length === 0;
  const showEmptyHelp = !collapsed && !showAutoPlaceholder && participants.length === 0;
  const showHistory = !collapsed && Array.isArray(chatHistory) && chatHistory.length > 0;

  const enabledCount = useMemo(
    () => participants.filter((p) => enabledMap[p.participant_id] !== false).length,
    [participants, enabledMap],
  );

  const handleOpenProfile = useCallback((participant) => {
    if (participant.kind === 'human') {
      handleOpenHumanModal();
      return;
    }
    openParticipantDirectory(participant.participant_id);
  }, [handleOpenHumanModal, openParticipantDirectory]);

  const handleResizePointerDown = useCallback((event) => {
    if (collapsed || typeof onWidthChange !== 'function') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    setResizing(true);
  }, [collapsed, onWidthChange, width]);

  useEffect(() => {
    if (!resizing) return undefined;

    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = Math.min(
        maxWidth,
        Math.max(minWidth, drag.startWidth + (event.clientX - drag.startX)),
      );
      onWidthChange?.(next);
    };

    const endDrag = (event) => {
      const drag = dragRef.current;
      if (drag && event?.pointerId != null && event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setResizing(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    document.body.classList.add('is-sidebar-resizing');

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      document.body.classList.remove('is-sidebar-resizing');
    };
  }, [resizing, minWidth, maxWidth, onWidthChange]);

  const widthStyle = collapsed
    ? undefined
    : { width: `${width}px`, minWidth: `${width}px` };

  return (
    <aside
      id="participant-sidebar"
      className={[
        'sidebar',
        collapsed ? 'sidebar--collapsed' : '',
        resizing ? 'sidebar--resizing' : '',
      ].filter(Boolean).join(' ')}
      style={widthStyle}
      aria-label="Participants"
      aria-expanded={!collapsed}
    >
      <NeonDesignRoot className={`neon-participant-sidebar${collapsed ? ' neon-participant-sidebar--collapsed' : ''}`}>
        {!collapsed && (
          <md-filled-tonal-button
            className="neon-participant-sidebar__create-btn"
            onClick={handleStartNewChat}
          >
            <Pencil size={18} strokeWidth={2.5} slot="icon" aria-hidden />
            New Chat
          </md-filled-tonal-button>
        )}

        {collapsed && (
          <button
            type="button"
            className="neon-participant-sidebar__add-btn neon-participant-sidebar__add-btn--rail"
            onClick={handleStartNewChat}
            aria-label="New chat"
            title="New Chat"
          >
            <Pencil size={18} strokeWidth={2.5} aria-hidden />
          </button>
        )}

        {!collapsed ? (
          <section className="neon-sidebar-section" aria-label="Participants">
            <button
              type="button"
              className="neon-sidebar-section__toggle"
              onClick={() => setParticipantsOpen((v) => !v)}
              aria-expanded={participantsOpen}
            >
              <span className="neon-sidebar-section__heading">
                <Users size={16} strokeWidth={2.5} className="neon-sidebar-section__icon" aria-hidden />
                <span className="neon-sidebar-section__title">Participants</span>
              </span>
              <span className="neon-sidebar-section__meta">
                <span className="neon-sidebar-section__count" aria-label="Enabled participants">
                  {enabledCount}/{maxParticipants}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={2.5}
                  className={`neon-sidebar-section__chevron${participantsOpen ? ' is-open' : ''}`}
                  aria-hidden
                />
              </span>
            </button>

            {participantsOpen && (
              <div className="neon-sidebar-section__body">
                {showAutoPlaceholder && (
                  <p className="neon-sidebar-section__help">Auto-select is on.</p>
                )}
                {showEmptyHelp && (
                  <p className="neon-sidebar-section__help">
                    Add participants to start — use the button below or the welcome screen.
                  </p>
                )}
                {showAutoPlaceholder && (
                  <div className="neon-participant-sidebar__empty-card">
                    <strong>Auto-select: {maxParticipants} participants</strong>
                    <div>
                      When you start the chat, the orchestrator will pick the
                      {' '}<strong>{maxParticipants}</strong> participants whose
                      expertise best fits your question.
                    </div>
                  </div>
                )}
                <div className="neon-participant-sidebar__list" role="list">
                  {participants.map((p, i) => {
                    const enabled = enabledMap[p.participant_id] !== false;
                    const modelOverride = modelAssignments[p.participant_id];
                    return (
                      <ParticipantSidebarCard
                        key={p.participant_id}
                        participant={p}
                        colorIndex={i}
                        enabled={enabled}
                        modelOverride={modelOverride}
                        collapsed={false}
                        onToggleEnabled={() => handleSidebarToggleEnabled(p.participant_id, !enabled)}
                        onRemove={() => handleSidebarRemove(p.participant_id)}
                        onOpenProfile={handleOpenProfile}
                      />
                    );
                  })}
                </div>
                <md-text-button
                  className="neon-participant-sidebar__add-participant-btn"
                  onClick={() => openParticipantDirectory()}
                >
                  <Plus size={18} strokeWidth={2.5} slot="icon" aria-hidden />
                  Add Participant
                </md-text-button>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="neon-participant-sidebar__list" role="list">
              {participants.map((p, i) => {
                const enabled = enabledMap[p.participant_id] !== false;
                const modelOverride = modelAssignments[p.participant_id];
                return (
                  <ParticipantSidebarCard
                    key={p.participant_id}
                    participant={p}
                    colorIndex={i}
                    enabled={enabled}
                    modelOverride={modelOverride}
                    collapsed
                    onToggleEnabled={() => handleSidebarToggleEnabled(p.participant_id, !enabled)}
                    onRemove={() => handleSidebarRemove(p.participant_id)}
                    onOpenProfile={handleOpenProfile}
                  />
                );
              })}
            </div>
            <button
              type="button"
              className="neon-participant-sidebar__add-btn neon-participant-sidebar__add-btn--rail"
              onClick={() => openParticipantDirectory()}
              aria-label="Add participant"
              title="Add Participant"
            >
              <Plus size={18} strokeWidth={2.5} aria-hidden />
            </button>
          </>
        )}

        {showHistory && (
          <ChatHistoryList
            entries={chatHistory}
            activeHistoryId={activeHistoryId}
            open={chatsOpen}
            onToggle={() => setChatsOpen((v) => !v)}
            onSelect={loadHistoryChat}
            onDelete={deleteHistoryChat}
          />
        )}
      </NeonDesignRoot>

      {!collapsed && (
        <div
          className="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onKeyDown={(event) => {
            if (typeof onWidthChange !== 'function') return;
            const step = event.shiftKey ? 24 : 12;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              onWidthChange(width - step);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              onWidthChange(width + step);
            } else if (event.key === 'Home') {
              event.preventDefault();
              onWidthChange(minWidth);
            } else if (event.key === 'End') {
              event.preventDefault();
              onWidthChange(maxWidth);
            }
          }}
        />
      )}
    </aside>
  );
}
