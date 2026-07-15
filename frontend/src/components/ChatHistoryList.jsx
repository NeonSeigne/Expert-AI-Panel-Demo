import React, { useCallback } from 'react';
import { ChevronRight, MessagesSquare, X } from 'lucide-react';

function formatRelativeTime(savedAt) {
  if (!savedAt) return '';
  const diffMs = Date.now() - savedAt;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return new Date(savedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function truncateQuestion(q, max = 72) {
  const text = (q || '').trim().replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export default function ChatHistoryList({
  entries = [],
  activeHistoryId = null,
  open = true,
  onToggle,
  onSelect,
  onDelete,
}) {
  const handleSelect = useCallback((id) => {
    if (typeof onSelect === 'function') onSelect(id);
  }, [onSelect]);

  const handleDelete = useCallback((e, id) => {
    e.stopPropagation();
    if (typeof onDelete === 'function') onDelete(id);
  }, [onDelete]);

  if (!entries.length) return null;

  return (
    <section
      className={
        'neon-chat-history neon-sidebar-section'
        + (open ? ' neon-chat-history--open' : '')
      }
      aria-label="Projects"
    >
      <button
        type="button"
        className="neon-sidebar-section__toggle"
        onClick={() => { if (typeof onToggle === 'function') onToggle(); }}
        aria-expanded={open}
      >
        <span className="neon-sidebar-section__heading">
          <MessagesSquare size={16} strokeWidth={2.5} className="neon-sidebar-section__icon" aria-hidden />
          <span className="neon-sidebar-section__title">Projects</span>
        </span>
        <span className="neon-sidebar-section__meta">
          <span className="neon-sidebar-section__count" aria-label="Saved projects">
            {entries.length}
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.5}
            className={`neon-sidebar-section__chevron${open ? ' is-open' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="neon-sidebar-section__body">
          <div className="neon-chat-history__list" role="list">
            {entries.map((entry) => {
              const active = entry.id === activeHistoryId;
              const count = entry.messageCount
                || (entry.messages?.length || 0) + (entry.systemMessages?.length || 0);
              return (
                <div
                  key={entry.id}
                  role="listitem"
                  className={`neon-chat-history__item${active ? ' neon-chat-history__item--active' : ''}`}
                >
                  <button
                    type="button"
                    className="neon-chat-history__select"
                    onClick={() => handleSelect(entry.id)}
                    title={entry.projectName || entry.question}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className="neon-chat-history__question">
                      {truncateQuestion(entry.projectName)
                        || truncateQuestion(entry.question)
                        || 'Untitled project'}
                    </span>
                    <span className="neon-chat-history__meta">
                      {formatRelativeTime(entry.savedAt)}
                      {count > 0 ? ` · ${count} msgs` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="neon-chat-history__delete"
                    onClick={(e) => handleDelete(e, entry.id)}
                    aria-label="Remove from history"
                    title="Remove from history"
                  >
                    <X size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
