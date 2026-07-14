// Vendored from neon-design@dev-cursor — final/components/NeonComposer.jsx
import { useEffect, useRef } from 'react';
import { ArrowUp, Loader2, Mic, Plus } from 'lucide-react';
import IconButton from './IconButton';

const ICON_SIZE = 20;
const ICON_STROKE = 2;
/** Auto-grow cap (~8–10 lines) before internal scroll */
const INPUT_MAX_HEIGHT_PX = 200;
const INPUT_MIN_HEIGHT_PX = 24;

export default function NeonComposer({
  value,
  onChange,
  onSend,
  onAttach,
  onKeyDown,
  placeholder = 'Type something here …',
  disabled = false,
  streaming = false,
  sendDisabled = false,
  micListening = false,
  micTranscribing = false,
  onToggleMic,
  showMic = true,
  showAttach = true,
  toolbar = null,
  className = '',
  inputRef,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(Math.min(el.scrollHeight, INPUT_MAX_HEIGHT_PX), INPUT_MIN_HEIGHT_PX)}px`;
  }, [value]);

  const setRefs = (el) => {
    textareaRef.current = el;
    if (typeof inputRef === 'function') {
      inputRef(el);
    } else if (inputRef) {
      inputRef.current = el;
    }
  };

  const handleSend = () => {
    if (onSend && value?.trim()) onSend(value);
  };

  const handleKeyDown = (e) => {
    if (onKeyDown) {
      onKeyDown(e);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled = disabled || streaming || micTranscribing;
  const canSend = Boolean(value?.trim()) && !streaming && !sendDisabled && !disabled;

  return (
    <div className={`neon-composer neon-composer--final${className ? ` ${className}` : ''}`}>
      <div
        className={`neon-composer-pill${micListening ? ' neon-composer-pill--listening' : ''}${canSend ? ' neon-composer-pill--ready' : ''}`}
      >
        <textarea
          ref={setRefs}
          className="neon-composer-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={inputDisabled}
          rows={1}
          aria-label="Message input"
        />

        <div className="neon-composer-footer">
          <div className="neon-composer-footer-left">
            {showAttach && (
              <IconButton
                label="Add attachment"
                ghost
                disabled={inputDisabled}
                onClick={onAttach}
              >
                <Plus size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
              </IconButton>
            )}
          </div>

          <div className="neon-composer-actions">
            {showMic && onToggleMic && (
              <IconButton
                label={micListening ? 'Stop recording' : 'Speak your message'}
                ghost
                disabled={inputDisabled}
                onClick={onToggleMic}
              >
                {micTranscribing ? (
                  <Loader2 size={ICON_SIZE} strokeWidth={ICON_STROKE} className="neon-composer-spin" aria-hidden />
                ) : (
                  <Mic size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                )}
              </IconButton>
            )}

            <IconButton
              label="Send message"
              filled
              disabled={!canSend}
              onClick={handleSend}
              className={canSend ? 'neon-composer-send--ready' : 'neon-composer-send--idle'}
            >
              {streaming ? (
                <Loader2 size={ICON_SIZE} strokeWidth={ICON_STROKE} className="neon-composer-spin" aria-hidden />
              ) : (
                <ArrowUp size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
              )}
            </IconButton>
          </div>
        </div>
      </div>

      {toolbar && <div className="neon-composer-toolbar">{toolbar}</div>}
    </div>
  );
}
