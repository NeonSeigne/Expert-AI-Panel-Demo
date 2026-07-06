import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, UserPlus, UserCheck, Table2 } from 'lucide-react';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';

export default function HeaderMoreMenu() {
  const { humanParticipant, handleOpenHumanModal } = useParticipants();
  const { hasChat, handleShowTableView } = useChatSession();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fire = (fn) => () => { fn?.(); setOpen(false); };

  return (
    <div className="dev-wrap header-actions-mobile" ref={wrapRef}>
      <div className="dev-dropdown-header">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(o => !o)}
          title="More actions"
          aria-label="More actions"
          aria-expanded={open}
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="dev-panel">
            <button
              type="button"
              className={'dev-panel-row' + (humanParticipant ? ' ccai-human-add-btn-active' : '')}
              onClick={fire(handleOpenHumanModal)}
              title={humanParticipant
                ? `Edit ${humanParticipant.name}'s credential summary`
                : 'Add a human participant to the conversation'}
            >
              {humanParticipant ? (
                <>
                  <UserCheck size={14} className="dev-check-icon" />
                  {humanParticipant.name}
                </>
              ) : (
                <>
                  <UserPlus size={14} className="dev-check-icon" />
                  Add a Human Participant
                </>
              )}
            </button>
            <button
              type="button"
              className="dev-panel-row"
              disabled={!hasChat}
              onClick={fire(handleShowTableView)}
              title={hasChat
                ? 'Open the conversation summary table'
                : 'Start a chat to view the summary table'}
            >
              <Table2 size={14} className="dev-check-icon" />
              Table View
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
