import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import {
  startCredentialDraft,
  answerCredentialDraft,
  cancelCredentialDraft,
} from '../utils/api';

/**
 * Modal for adding (or editing) the in-the-loop human participant.
 *
 * Two flows:
 *   - Manual: the user types their own credential summary into the
 *     text area. The textarea pre-fills with a sample so they always
 *     have somewhere to start.
 *   - AI-assisted: clicking "Use AI to make a Credential Summary"
 *     opens a small chat with the orchestrator LLM. The LLM asks 3-6
 *     adaptive questions and emits a final structured summary, which
 *     replaces the textarea content.
 *
 * On Approve, the modal hands the finalized
 *   { participant_id, name, credential_summary: {...} }
 * shape back to App.js via onSave. App.js persists it via storage and
 * adds the human to the active participant set.
 *
 * "Download as .txt" lets the user keep a copy of their summary
 * outside the demo (useful if they want to reuse it elsewhere).
 */
export default function HumanParticipantModal({
  isOpen,
  initial,
  question,
  orchestratorModel,
  onClose,
  onSave,
  onRemove,
}) {
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  // AI Q&A state
  const [aiDraftId, setAiDraftId] = useState(null);
  const [aiHistory, setAiHistory] = useState([]); // [{q, a}, ...]
  const [aiCurrentQuestion, setAiCurrentQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiCounts, setAiCounts] = useState({ asked: 0, max: 6 });

  const sampleRef = useRef('');

  // Reset on open / when the initial payload changes.
  useEffect(() => {
    if (!isOpen) return;
    const initialName = initial?.name || 'Pat';
    setName(initialName);
    const sample = initial?.credential_summary
      ? renderSummaryToText(initial.credential_summary)
      : sampleSummaryText(initialName);
    sampleRef.current = sample;
    setSummary(sample);
    setAiDraftId(null);
    setAiHistory([]);
    setAiCurrentQuestion('');
    setAiAnswer('');
    setAiBusy(false);
    setAiError('');
    setAiCounts({ asked: 0, max: 6 });
  }, [isOpen, initial]);

  // Abandon the AI Q&A if the modal is closed mid-flow.
  useEffect(() => {
    if (!isOpen && aiDraftId) {
      cancelCredentialDraft(aiDraftId);
    }
  }, [isOpen, aiDraftId]);

  const handleStartAi = useCallback(async () => {
    if (!name.trim()) {
      setAiError('Please enter a name first.');
      return;
    }
    if (!question || !question.trim()) {
      setAiError('Enter your discussion question before using AI assist.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    try {
      const result = await startCredentialDraft({
        name: name.trim(),
        question: question.trim(),
        max_questions: 6,
        orchestrator_model_id: orchestratorModel || null,
      });
      setAiDraftId(result.draft_id);
      setAiCounts({
        asked: result.questions_asked || 1,
        max: result.max_questions || 6,
      });
      if (result.kind === 'summary') {
        setSummary(renderSummaryToText({
          ...(result.summary || {}),
          name: result.summary?.name || name.trim(),
        }));
        setAiCurrentQuestion('');
      } else {
        setAiCurrentQuestion(result.question || '');
      }
    } catch (err) {
      setAiError(err.message || 'AI assist failed to start.');
    } finally {
      setAiBusy(false);
    }
  }, [name, question, orchestratorModel]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!aiDraftId) return;
    if (!aiAnswer.trim()) {
      setAiError('Please type an answer first.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    const lastQ = aiCurrentQuestion;
    const lastA = aiAnswer.trim();
    try {
      const result = await answerCredentialDraft(aiDraftId, lastA);
      setAiHistory(prev => [...prev, { q: lastQ, a: lastA }]);
      setAiAnswer('');
      setAiCounts({
        asked: result.questions_asked || aiCounts.asked,
        max: result.max_questions || aiCounts.max,
      });
      if (result.kind === 'summary') {
        setSummary(renderSummaryToText({
          ...(result.summary || {}),
          name: result.summary?.name || name.trim(),
        }));
        setAiCurrentQuestion('');
        setAiDraftId(null);
      } else {
        setAiCurrentQuestion(result.question || '');
      }
    } catch (err) {
      setAiError(err.message || 'AI assist failed to continue.');
    } finally {
      setAiBusy(false);
    }
  }, [aiDraftId, aiAnswer, aiCurrentQuestion, aiCounts.asked, aiCounts.max, name]);

  const handleStopAi = useCallback(async () => {
    if (aiDraftId) {
      await cancelCredentialDraft(aiDraftId);
    }
    setAiDraftId(null);
    setAiCurrentQuestion('');
    setAiAnswer('');
    setAiError('');
  }, [aiDraftId]);

  const handleApprove = useCallback(() => {
    if (!name.trim()) {
      setAiError('Please enter a name before approving.');
      return;
    }
    if (!summary.trim()) {
      setAiError('Credential summary cannot be empty.');
      return;
    }
    const parsed = parseSummaryText(summary, name.trim());
    const pid = initial?.participant_id || `human_${Date.now()}`;
    onSave({
      participant_id: pid,
      name: name.trim(),
      credential_summary: parsed,
    });
  }, [name, summary, initial, onSave]);

  const handleDownload = useCallback(() => {
    const text = `Name: ${name}\n\n${summary}\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'human').replace(/\s+/g, '_')}-credential.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, summary]);

  if (!isOpen) return null;

  const aiInProgress = !!aiDraftId && !!aiCurrentQuestion;

  return (
    <div className="ccai-credentials-overlay">
      <div className="ccai-credentials-card ccai-human-modal-card">
        <div className="ccai-credentials-header">
          <div>
            <h2>Add a Human Participant</h2>
            <div className="ccai-credentials-subtitle">
              Give yourself (or another human) a seat at the table.
              The orchestrator will pause for your input when it's
              your turn.
            </div>
          </div>
          <div className="ccai-tab-spacer" />
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="ccai-human-modal-body">
          <label className="ccai-human-field">
            <span className="ccai-human-field-label">Name</span>
            <input
              type="text"
              className="ccai-human-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pat, Dr. Lopez, …"
            />
          </label>

          <div className="ccai-human-field">
            <div className="ccai-human-summary-header">
              <span className="ccai-human-field-label">
                Credential summary
              </span>
              <button
                type="button"
                className="btn-sm btn-outline ccai-human-ai-btn"
                onClick={handleStartAi}
                disabled={aiBusy || aiInProgress}
                title="Have the AI ask a few questions and draft a summary for you"
              >
                <Sparkles size={14} style={{ marginRight: 4 }} />
                Use AI to make a Credential Summary
              </button>
            </div>
            <textarea
              className="ccai-human-summary"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={10}
              spellCheck
            />
            <div className="ccai-human-summary-help">
              This is what the orchestrator and other participants will
              see about you. Edit it to your taste — or click the AI
              assist button above and answer a few questions.
            </div>
          </div>

          {aiInProgress && (
            <div className="ccai-human-ai-panel">
              <div className="ccai-human-ai-counter">
                AI assist · question {aiCounts.asked} of {aiCounts.max}
                <button
                  type="button"
                  className="ccai-human-ai-stop"
                  onClick={handleStopAi}
                  title="Stop the AI Q&A and keep what's in the textarea"
                >
                  <X size={12} /> Stop
                </button>
              </div>
              {aiHistory.map((qa, i) => (
                <div key={i} className="ccai-human-ai-turn">
                  <div className="ccai-human-ai-q">Q: {qa.q}</div>
                  <div className="ccai-human-ai-a">A: {qa.a}</div>
                </div>
              ))}
              <div className="ccai-human-ai-current-q">
                <strong>Q:</strong> {aiCurrentQuestion}
              </div>
              <textarea
                className="ccai-human-ai-answer"
                value={aiAnswer}
                onChange={e => setAiAnswer(e.target.value)}
                rows={3}
                placeholder="Your answer..."
                disabled={aiBusy}
              />
              <div className="ccai-human-ai-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmitAnswer}
                  disabled={aiBusy || !aiAnswer.trim()}
                >
                  {aiBusy ? 'Thinking…' : 'Send answer'}
                </button>
              </div>
            </div>
          )}

          {aiError && (
            <div className="ccai-human-error">{aiError}</div>
          )}
        </div>

        <div className="ccai-human-modal-footer">
          <div>
            {onRemove && initial?.participant_id && (
              <button
                type="button"
                className="btn-sm btn-outline ccai-human-remove"
                onClick={onRemove}
                title="Remove the human participant from this session"
              >
                <X size={14} style={{ marginRight: 4 }} />
                Remove human
              </button>
            )}
          </div>
          <div className="ccai-human-modal-footer-right">
            <button
              type="button"
              className="btn-sm btn-outline"
              onClick={handleDownload}
              disabled={!summary.trim()}
            >
              <Download size={14} style={{ marginRight: 4 }} />
              Download as .txt
            </button>
            <button type="button" className="btn-sm btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleApprove}
              disabled={!name.trim() || !summary.trim()}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function sampleSummaryText(name) {
  // The pre-fill is intentionally generic-but-plausible: the user can
  // edit a sentence or two and approve, or wipe it and start fresh.
  return [
    `Expertise: ${name} is a curious generalist with hands-on `
      + 'experience across several professional domains, comfortable '
      + 'asking pointed questions in unfamiliar territory.',
    '',
    `Style: Conversational and pragmatic; ${name} weighs trade-offs `
      + 'aloud and is happy to change their mind when shown new '
      + 'evidence.',
    '',
    'Credibility on this question: 0.55',
    '',
    'Bias to watch: Tendency to favor concrete, near-term solutions '
      + 'over abstract long-horizon ones.',
  ].join('\n');
}

function renderSummaryToText(cred) {
  if (!cred) return '';
  const lines = [];
  if (cred.expertise) lines.push(`Expertise: ${cred.expertise}`);
  if (cred.personality) lines.push('', `Style: ${cred.personality}`);
  if (cred.credibility_for_question !== undefined
      && cred.credibility_for_question !== null) {
    const v = Number(cred.credibility_for_question);
    if (!Number.isNaN(v)) {
      lines.push('', `Credibility on this question: ${v.toFixed(2)}`);
    }
  }
  if (cred.bias_to_watch) lines.push('', `Bias to watch: ${cred.bias_to_watch}`);
  return lines.join('\n');
}

/**
 * Parse the textarea content back into the structured shape the
 * backend expects. Looks for lines starting with the field labels;
 * anything else is appended to whichever field is current.
 *
 * This is tolerant: if no labels are found, the whole blob becomes
 * the `expertise` field (so naive users typing freeform still get a
 * usable credential summary on Approve).
 */
function parseSummaryText(text, name) {
  const result = {
    name,
    expertise: '',
    personality: '',
    credibility_for_question: 0.55,
    bias_to_watch: '',
  };
  let current = 'expertise';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('expertise:')) {
      current = 'expertise';
      result.expertise = line.slice(line.indexOf(':') + 1).trim();
    } else if (lower.startsWith('style:') || lower.startsWith('personality:')) {
      current = 'personality';
      result.personality = line.slice(line.indexOf(':') + 1).trim();
    } else if (lower.startsWith('credibility')) {
      current = 'credibility';
      const num = parseFloat(line.replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(num)) {
        // Heuristic: numbers > 1 are probably 0..100; coerce to 0..1.
        result.credibility_for_question = num > 1 ? num / 100 : num;
      }
    } else if (lower.startsWith('bias')) {
      current = 'bias_to_watch';
      result.bias_to_watch = line.slice(line.indexOf(':') + 1).trim();
    } else if (current === 'expertise') {
      result.expertise += (result.expertise ? '\n' : '') + line;
    } else if (current === 'personality') {
      result.personality += (result.personality ? '\n' : '') + line;
    } else if (current === 'bias_to_watch') {
      result.bias_to_watch += (result.bias_to_watch ? '\n' : '') + line;
    }
  }
  // Clamp credibility into the valid range.
  if (Number.isNaN(result.credibility_for_question)) {
    result.credibility_for_question = 0.55;
  }
  result.credibility_for_question = Math.max(
    0, Math.min(1, result.credibility_for_question),
  );
  return result;
}
