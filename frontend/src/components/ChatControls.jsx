import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';
import NeonDesignRoot from './NeonDesignRoot';
import NeonComposer from '../neon/NeonComposer';
import DemoQuestionPills from './DemoQuestionPills';
import ChatQuickSettings from './ChatQuickSettings';
import ProjectDocumentsSection from './ProjectDocumentsSection';
import { extractAttachment } from '../utils/api';
import { PROJECT_DOC_ACCEPT } from '../utils/projectDocuments';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 5_000_000;

function pickRandomDemoQuestions(questions, count = 4) {
  if (questions.length <= count) return [...questions];
  const pool = [...questions];
  const picked = [];
  while (picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

function newLocalId() {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isMarketingPrompt(q) {
  return Array.isArray(q?.tags) && q.tags.includes('marketing');
}

/** Composer + demo pills for starting a project (welcome / empty state). */
export default function ChatControls({ centered = false }) {
  const { demoQuestions } = useParticipants();
  const {
    handleStart,
    startDisabled,
    isRunning,
    hasContent,
    startDisabledReason,
    startDisabledTooltip,
    getDraftQuestionRef,
    projectDocuments,
    removeProjectDocument,
    addProjectDocument,
  } = useChatSession();

  const [userText, setUserText] = useState('');
  const [featuredPills, setFeaturedPills] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState('');
  const [projectDocsBusy, setProjectDocsBusy] = useState(false);
  const fileInputRef = useRef(null);

  const marketingQuestions = useMemo(
    () => (demoQuestions || []).filter(isMarketingPrompt),
    [demoQuestions],
  );

  const resolveQuestion = useCallback(() => userText.trim(), [userText]);

  useEffect(() => {
    if (getDraftQuestionRef) {
      getDraftQuestionRef.current = resolveQuestion;
    }
  }, [getDraftQuestionRef, resolveQuestion]);

  useEffect(() => {
    if (isRunning || hasContent || marketingQuestions.length === 0) {
      if (marketingQuestions.length === 0) setFeaturedPills([]);
      return;
    }
    setFeaturedPills(pickRandomDemoQuestions(marketingQuestions));
  }, [isRunning, hasContent, marketingQuestions]);

  const readyAttachments = attachments.filter((a) => a.status === 'ready' && a.text);
  const attaching = attachments.some((a) => a.status === 'pending') || projectDocsBusy;

  const onStartClick = () => {
    const question = resolveQuestion();
    if (!question || startDisabled || attaching) return;
    // Project docs are merged in handleStart; pass session-only attaches here.
    handleStart(
      question,
      readyAttachments.map((a) => ({ name: a.name, text: a.text })),
    );
    setUserText('');
    setAttachments([]);
    setAttachError('');
  };

  const handlePillSelect = (question) => {
    const text = (question?.text || '').trim();
    if (!text || startDisabled) return;
    setUserText(text);
  };

  const canStart = !startDisabled && !!resolveQuestion() && !attaching;
  const startButtonTitle = !canStart && startDisabledTooltip ? startDisabledTooltip : undefined;

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && canStart) {
      e.preventDefault();
      onStartClick();
    }
  };

  const openFilePicker = useCallback(() => {
    if (startDisabled || attaching) return;
    fileInputRef.current?.click();
  }, [startDisabled, attaching]);

  const handleFileChange = useCallback(async (e) => {
    // Snapshot before clearing — FileList is live and empties when value is reset.
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file) return;
    setAttachError('');
    if (attachments.length >= MAX_ATTACHMENTS) {
      setAttachError(`At most ${MAX_ATTACHMENTS} session attachments`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setAttachError('File too large (max 5MB)');
      return;
    }
    const id = newLocalId();
    const name = file.name || 'upload';
    setAttachments((prev) => [...prev, { id, name, status: 'pending', text: '', error: '' }]);
    try {
      const data = await extractAttachment(file);
      setAttachments((prev) => prev.map((a) => (
        a.id === id
          ? { ...a, name: data.name || name, text: data.text || '', status: 'ready', error: '' }
          : a
      )));
    } catch (err) {
      const reason = err.message || 'Upload failed';
      setAttachments((prev) => prev.map((a) => (
        a.id === id
          ? { ...a, status: 'error', text: '', error: reason }
          : a
      )));
      setAttachError(reason);
    }
  }, [attachments.length]);

  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const placeholder = startDisabled && startDisabledReason
    ? startDisabledReason
    : demoQuestions.length === 0
      ? 'Loading demo questions…'
      : 'Type your question…';

  // Stop and Start new project live in ChatArea (status dock / after summary).
  if (isRunning || hasContent) return null;

  const hasSessionChips = attachments.length > 0;

  return (
    <div className={`chat-controls${centered ? ' chat-controls--centered' : ''}`}>
      <NeonDesignRoot>
        {hasSessionChips && (
          <ul className="ccai-composer-attachments" aria-label="Session attachments">
            {attachments.map((a) => (
              <li
                key={a.id}
                className={`ccai-composer-attachment-chip${
                  a.status === 'error' ? ' ccai-composer-attachment-chip--error' : ''
                }`}
              >
                <span className="ccai-composer-attachment-name">
                  {a.status === 'pending'
                    ? `Uploading ${a.name}…`
                    : a.status === 'error'
                      ? `${a.name}: Failed upload`
                      : a.name}
                </span>
                <button
                  type="button"
                  className="ccai-composer-attachment-remove"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={
                    a.status === 'error'
                      ? `Dismiss failed upload ${a.name}`
                      : `Remove ${a.name}`
                  }
                  disabled={a.status === 'pending'}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachError && (
          <p className="ccai-composer-attach-error" role="alert">{attachError}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={PROJECT_DOC_ACCEPT}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-hidden
        />
        <NeonComposer
          value={userText}
          onChange={setUserText}
          onSend={onStartClick}
          onAttach={openFilePicker}
          onKeyDown={handleComposerKeyDown}
          placeholder={placeholder}
          disabled={demoQuestions.length === 0}
          sendDisabled={!canStart}
          showMic={false}
          showAttach
          toolbar={
            startButtonTitle ? (
              <span className="chat-start-hint" role="status">
                {startButtonTitle}
              </span>
            ) : null
          }
        />
        <ChatQuickSettings />
        <ProjectDocumentsSection
          documents={projectDocuments || []}
          onRemove={removeProjectDocument}
          onAdd={addProjectDocument}
          getExistingDocs={() => projectDocuments || []}
          disabled={isRunning}
          onBusyChange={setProjectDocsBusy}
        />
        <DemoQuestionPills
          questions={featuredPills}
          onSelect={handlePillSelect}
          disabled={startDisabled || marketingQuestions.length === 0}
        />
      </NeonDesignRoot>
    </div>
  );
}
