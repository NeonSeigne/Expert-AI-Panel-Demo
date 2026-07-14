import React, { useState, useCallback, useEffect } from 'react';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';
import NeonDesignRoot from './NeonDesignRoot';
import NeonComposer from '../neon/NeonComposer';
import DemoQuestionPills from './DemoQuestionPills';
import ChatQuickSettings from './ChatQuickSettings';

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

/** Composer + demo pills for starting a chat (welcome / empty state). */
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
  } = useChatSession();

  const [userText, setUserText] = useState('');
  const [featuredPills, setFeaturedPills] = useState([]);

  const resolveQuestion = useCallback(() => userText.trim(), [userText]);

  useEffect(() => {
    if (getDraftQuestionRef) {
      getDraftQuestionRef.current = resolveQuestion;
    }
  }, [getDraftQuestionRef, resolveQuestion]);

  useEffect(() => {
    if (isRunning || hasContent || demoQuestions.length === 0) return;
    setFeaturedPills(pickRandomDemoQuestions(demoQuestions));
  }, [isRunning, hasContent, demoQuestions]);

  const onStartClick = () => {
    const question = resolveQuestion();
    if (!question || startDisabled) return;
    handleStart(question);
    setUserText('');
  };

  const handlePillSelect = (question) => {
    const text = (question?.text || '').trim();
    if (!text || startDisabled) return;
    setUserText(text);
  };

  const canStart = !startDisabled && !!resolveQuestion();
  const startButtonTitle = !canStart && startDisabledTooltip ? startDisabledTooltip : undefined;

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && canStart) {
      e.preventDefault();
      onStartClick();
    }
  };

  const placeholder = startDisabled && startDisabledReason
    ? startDisabledReason
    : demoQuestions.length === 0
      ? 'Loading demo questions…'
      : 'Type your question…';

  // Stop and Start new chat live in ChatArea (status dock / after summary).
  if (isRunning || hasContent) return null;

  return (
    <div className={`chat-controls${centered ? ' chat-controls--centered' : ''}`}>
      <NeonDesignRoot>
        <NeonComposer
          value={userText}
          onChange={setUserText}
          onSend={onStartClick}
          onKeyDown={handleComposerKeyDown}
          placeholder={placeholder}
          disabled={demoQuestions.length === 0}
          sendDisabled={!canStart}
          showMic={false}
          showAttach={false}
          toolbar={
            startButtonTitle ? (
              <span className="chat-start-hint" role="status">
                {startButtonTitle}
              </span>
            ) : null
          }
        />
        <ChatQuickSettings />
        <DemoQuestionPills
          questions={featuredPills}
          onSelect={handlePillSelect}
          disabled={startDisabled || demoQuestions.length === 0}
        />
      </NeonDesignRoot>
    </div>
  );
}
