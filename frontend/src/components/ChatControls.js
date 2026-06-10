import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play } from 'lucide-react';

const DEMO_SUFFIX = ' [Or type your own question]';

function formatDemoDisplay(question) {
  if (!question) return '';
  const label = (question.title || question.text || '').trim();
  return `Demo Question: ${label}${DEMO_SUFFIX}`;
}

/**
 * Question field pre-filled with a cycling demo prompt; "Start Chat"
 * uses the demo question text or whatever the user typed.
 */
const ChatControls = forwardRef(function ChatControls({
  demoQuestions = [],
  onStart,
  onStop,
  disabled,
  isRunning,
  disabledReason,
  activeQuestion,
}, ref) {
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

  useImperativeHandle(ref, () => ({
    getDraftQuestion: resolveQuestion,
  }), [resolveQuestion]);

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
    if (disabled || mode !== 'demo') return;
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

  const handleStart = () => {
    const question = resolveQuestion();
    if (!question || disabled) return;
    onStart(question);
    advanceDemo();
  };

  const canStart = !disabled && !!resolveQuestion();

  return (
    <div className="chat-controls">
      {isRunning ? (
        <>
          <button className="btn-stop" onClick={onStop}>
            Stop Chat
          </button>
          {activeQuestion && (
            <div
              className="ccai-active-question"
              title={activeQuestion}
            >
              <span className="ccai-active-question-label">Question:</span>
              <span className="ccai-active-question-text">{activeQuestion}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            value={inputValue}
            placeholder={
              disabled
                ? (disabledReason || 'Add participants to start a conversation')
                : (demoQuestions.length === 0 ? 'Loading demo questions…' : '')
            }
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={(e) => {
              handleKeyDown(e);
              if (e.key === 'Enter' && canStart) {
                handleStart();
              }
            }}
          />
          <button
            className="btn-primary"
            disabled={!canStart}
            onClick={handleStart}
          >
            <Play size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Start Chat
          </button>
        </>
      )}
    </div>
  );
});

export default ChatControls;
