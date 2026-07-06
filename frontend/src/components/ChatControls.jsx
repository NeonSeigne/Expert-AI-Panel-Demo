import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play } from 'lucide-react';
import { useParticipants } from '../context/ParticipantsContext';
import { useChatSession } from '../context/ChatSessionContext';

const DEMO_SUFFIX = ' [Or type your own question]';

function formatDemoDisplay(question) {
  if (!question) return '';
  const label = (question.title || question.text || '').trim();
  return `Demo Question: ${label}${DEMO_SUFFIX}`;
}

export default function ChatControls() {
  const { demoQuestions } = useParticipants();
  const {
    handleStart,
    handleStop,
    startDisabled,
    isRunning,
    startDisabledReason,
    startDisabledTooltip,
    activeQuestion,
    getDraftQuestionRef,
  } = useChatSession();

  const demoIndexRef = useRef(0);
  const [demoIndex, setDemoIndex] = useState(0);
  const [mode, setMode] = useState('demo');
  const [userText, setUserText] = useState('');

  const currentDemo = demoQuestions.length > 0
    ? demoQuestions[demoIndex % demoQuestions.length]
    : null;
  const demoDisplay = formatDemoDisplay(currentDemo);
  const inputValue = mode === 'demo' ? demoDisplay : userText;

  const resolveQuestion = useCallback(() => {
    if (mode === 'custom') return userText.trim();
    return (currentDemo?.text || '').trim();
  }, [mode, userText, currentDemo]);

  useEffect(() => {
    if (getDraftQuestionRef) {
      getDraftQuestionRef.current = resolveQuestion;
    }
  }, [getDraftQuestionRef, resolveQuestion]);

  const advanceDemo = useCallback(() => {
    if (demoQuestions.length === 0) return;
    const next = (demoIndexRef.current + 1) % demoQuestions.length;
    demoIndexRef.current = next;
    setDemoIndex(next);
    setMode('demo');
    setUserText('');
  }, [demoQuestions.length]);

  const handleChange = (e) => {
    const v = e.target.value;
    if (mode === 'demo') {
      if (v === '' || v === demoDisplay) return;
      setMode('custom');
      setUserText(v);
      return;
    }
    if (v === '') {
      setMode('demo');
      setUserText('');
      return;
    }
    setUserText(v);
  };

  const handleKeyDown = (e) => {
    if (mode !== 'demo') return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setMode('custom');
      setUserText(e.key);
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setMode('custom');
      setUserText('');
      e.preventDefault();
    }
  };

  const onStartClick = () => {
    const question = resolveQuestion();
    if (!question || startDisabled) return;
    handleStart(question);
    advanceDemo();
  };

  const canStart = !startDisabled && !!resolveQuestion();
  const startButtonTitle = !canStart && startDisabledTooltip ? startDisabledTooltip : undefined;

  return (
    <div className="chat-controls">
      {isRunning ? (
        <>
          <button className="btn-stop" onClick={handleStop}>
            Stop Chat
          </button>
          {activeQuestion && (
            <div className="ccai-active-question" title={activeQuestion}>
              <span className="ccai-active-question-label">Question:</span>
              <span className="ccai-active-question-text">{activeQuestion}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="chat-controls-row">
            <input
              type="text"
              className="chat-controls-question"
              value={inputValue}
              placeholder={
                startDisabled && startDisabledReason
                  ? startDisabledReason
                  : demoQuestions.length === 0
                    ? 'Loading demo questions…'
                    : ''
              }
              onChange={handleChange}
              onKeyDown={(e) => {
                handleKeyDown(e);
                if (e.key === 'Enter' && canStart) {
                  e.preventDefault();
                  onStartClick();
                }
              }}
            />
            <span
              className={'chat-start-btn-wrap' + (startButtonTitle ? ' chat-start-btn-wrap-disabled' : '')}
              title={startButtonTitle}
            >
              <button
                type="button"
                className="btn-primary chat-controls-start"
                disabled={!canStart}
                onClick={onStartClick}
                aria-disabled={!canStart}
              >
                <Play size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Start Chat
              </button>
            </span>
          </div>
          {startButtonTitle && (
            <span className="chat-start-hint" role="status">
              {startButtonTitle}
            </span>
          )}
        </>
      )}
    </div>
  );
}
