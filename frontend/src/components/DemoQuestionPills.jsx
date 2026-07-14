import React, { useCallback } from 'react';
import '../neon/neon-material.register.js';

const PILL_SHADOW_STYLES = `
  :host {
    text-wrap: wrap;
    white-space: normal;
    height: auto;
    min-height: 32px;
    align-items: center;
    max-width: 100%;
  }
  .label {
    overflow: visible;
    white-space: normal;
    text-align: center;
  }
  .button {
    height: auto;
    min-height: 100%;
    padding-block: 6px;
  }
`;

function applyPillShadowStyles(el) {
  if (!el || el.dataset.pillStyled) return;

  const inject = () => {
    if (!el.shadowRoot || el.dataset.pillStyled) return;
    const style = document.createElement('style');
    style.textContent = PILL_SHADOW_STYLES;
    el.shadowRoot.appendChild(style);
    el.dataset.pillStyled = '1';
  };

  if (el.shadowRoot) {
    inject();
    return;
  }

  customElements.whenDefined('md-outlined-button').then(() => {
    requestAnimationFrame(inject);
  });
}

export default function DemoQuestionPills({ questions, onSelect, disabled = false }) {
  const pillRef = useCallback((el) => {
    applyPillShadowStyles(el);
  }, []);

  if (!questions || questions.length === 0) return null;

  return (
    <div className="demo-question-suggestions">
      <div className="demo-question-suggestions-title">Suggested Prompts</div>
      <div className="demo-question-pills" role="group" aria-label="Suggested prompts">
        {questions.map((q) => (
          <md-outlined-button
            key={q.id}
            ref={pillRef}
            className="demo-question-pill"
            disabled={disabled || undefined}
            onClick={() => onSelect(q)}
          >
            {q.title}
          </md-outlined-button>
        ))}
      </div>
    </div>
  );
}
