import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Upload, Save, Trash2, Wand2 } from 'lucide-react';
import { generateRole, generateRoleFreeform, suggestModel } from '../utils/api';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import MdDialog from './md/MdDialog';
import '../neon/neon-material.register.js';

export default function ExpertPersonaModal({
  isOpen,
  initial,
  onClose,
  onSave,
  onDelete,
}) {
  const { allModelsFlat: allModels, orchestratorModel } = useSettings();
  const { expertDefaultModelId: defaultModelId, expertPanelContext: panelContext } = useParticipants();
  const orchestratorModelId = orchestratorModel || undefined;
  const [activeTab, setActiveTab] = useState('freeform');
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [identity, setIdentity] = useState('');
  const [samples, setSamples] = useState('');
  const [freeText, setFreeText] = useState('');
  const [roleStyle, setRoleStyle] = useState('ai_completed');
  const [modelId, setModelId] = useState(defaultModelId || '');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestMessage, setSuggestMessage] = useState('');
  const fileInputRef = useRef(null);

  const rolePromptText = useMemo(
    () => (generatedPrompt || '').trim(),
    [generatedPrompt],
  );

  const composeSourceText = useCallback(() => {
    if (activeTab === 'freeform') {
      return freeText.trim();
    }
    return [identity, profile, samples]
      .map(s => (s || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }, [activeTab, freeText, identity, profile, samples]);

  const hasDescriptionContent = useMemo(() => {
    if (activeTab === 'freeform') {
      return Boolean(freeText.trim());
    }
    return Boolean(identity.trim() || profile.trim() || samples.trim());
  }, [activeTab, freeText, identity, profile, samples]);

  const modelNameForId = useCallback((id) => {
    const m = (allModels || []).find(x => x.id === id);
    return m ? m.name : id;
  }, [allModels]);

  const modelProviderForId = useCallback((id) => {
    const m = (allModels || []).find(x => x.id === id);
    return m?.provider || '';
  }, [allModels]);

  const resolveModelId = useCallback((preferred) => {
    const models = allModels || [];
    if (preferred && models.some(m => m.id === preferred)) {
      return preferred;
    }
    return models[0]?.id || '';
  }, [allModels]);

  useEffect(() => {
    if (!isOpen) return;
    if (initial) {
      setActiveTab(initial.input_mode || 'freeform');
      setName(initial.name || '');
      setProfile(initial.profile || '');
      setIdentity(initial.identity || '');
      setSamples(initial.samples || '');
      setFreeText(initial.freeform || '');
      setRoleStyle(initial.role_style || 'ai_completed');
      setModelId(resolveModelId(initial.model_id || defaultModelId));
      setGeneratedPrompt(initial.role_prompt || '');
    } else {
      setActiveTab('freeform');
      setName('');
      setProfile('');
      setIdentity('');
      setSamples('');
      setFreeText('');
      setRoleStyle('ai_completed');
      setModelId(resolveModelId(defaultModelId));
      setGeneratedPrompt('');
    }
    setError('');
    setSuggestion(null);
    setSuggestMessage('');
    setSuggestBusy(false);
  }, [isOpen, initial, defaultModelId, resolveModelId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setFreeText(prev => (prev ? prev + '\n\n' : '') + text);
    } catch (err) {
      setError(`File read failed: ${err.message}`);
    }
    e.target.value = '';
  };

  const handleGenerate = async () => {
    setError('');
    if (!name.trim()) {
      setError('Persona needs a name.');
      return;
    }
    if (!hasDescriptionContent) {
      setError('Add a description before generating a role prompt.');
      return;
    }
    setBusy(true);
    try {
      const result = activeTab === 'freeform'
        ? await generateRoleFreeform({
          name: name.trim(),
          text: freeText,
          role_style: roleStyle,
          orchestrator_model_id: orchestratorModelId || undefined,
        })
        : await generateRole({
          name: name.trim(),
          profile,
          identity,
          samples,
          role_style: roleStyle,
          orchestrator_model_id: orchestratorModelId || undefined,
        });
      setGeneratedPrompt(result.role_prompt || '');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSuggestModel = async () => {
    setError('');
    setSuggestion(null);
    setSuggestMessage('');
    const sourceText = composeSourceText();
    if (!sourceText && !rolePromptText) {
      setSuggestMessage(
        'Enter a description or role prompt for a model to be suggested.',
      );
      return;
    }
    if (!(allModels || []).length) {
      setSuggestMessage('No models available to suggest from.');
      return;
    }
    setSuggestBusy(true);
    try {
      const result = await suggestModel({
        persona_name: name.trim() || 'Unnamed',
        source_text: sourceText,
        role_prompt: rolePromptText,
        available_models: allModels,
        panel_context: panelContext || [],
        orchestrator_model_id: orchestratorModelId || undefined,
      });
      setSuggestion({
        modelId: result.recommended_model_id,
        rationale: result.rationale || '',
      });
    } catch (err) {
      setSuggestMessage(err.message || String(err));
    } finally {
      setSuggestBusy(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion?.modelId) return;
    setModelId(suggestion.modelId);
    setSuggestion(null);
  };

  const canSave = name.trim() && modelId && generatedPrompt.trim();
  const handleSave = () => {
    if (!canSave) return;
    onSave({
      participant_id: initial?.participant_id || `expert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'expert',
      name: name.trim(),
      model_id: modelId,
      role_prompt: generatedPrompt.trim(),
      input_mode: activeTab,
      role_style: roleStyle,
      profile,
      identity,
      samples,
      freeform: freeText,
    });
  };

  return (
    <MdDialog
      open={Boolean(isOpen)}
      onClose={onClose}
      size="large"
      headline={initial ? `Edit Expert Persona: ${initial.name}` : 'Create Expert Persona'}
      actions={(
        <>
          {initial && onDelete ? (
            <md-text-button
              type="button"
              onClick={() => onDelete(initial.participant_id)}
            >
              <Trash2 size={16} slot="icon" aria-hidden />
              Delete
            </md-text-button>
          ) : null}
          <span style={{ flex: 1 }} />
          <md-text-button type="button" onClick={onClose}>
            Cancel
          </md-text-button>
          <md-filled-button
            type="button"
            disabled={!canSave || undefined}
            onClick={handleSave}
          >
            <Save size={16} slot="icon" aria-hidden />
            {initial ? 'Save changes' : 'Save persona'}
          </md-filled-button>
        </>
      )}
    >
      <div className="ccai-expert-modal-body">
        <div className="ccai-expert-row">
          <div className="ccai-expert-field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              placeholder="e.g. Dr. Patel - Pediatric Cardiologist"
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="ccai-expert-field ccai-expert-model-field">
            <label>Powered by LLM</label>
            <div className="ccai-expert-model-row">
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
              >
                <option value="">Pick a model...</option>
                {(allModels || []).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.provider ? `(${m.provider})` : ''}
                  </option>
                ))}
              </select>
              <md-outlined-button
                type="button"
                className="ccai-suggest-model-btn"
                onClick={handleSuggestModel}
                disabled={suggestBusy || !(allModels || []).length || undefined}
                title="Analyze the role prompt and recommend a model"
              >
                <Wand2 size={12} slot="icon" aria-hidden />
                {suggestBusy ? 'Suggesting...' : 'Suggest a model'}
              </md-outlined-button>
            </div>
            {suggestMessage && (
              <div className="ccai-expert-suggest-message">{suggestMessage}</div>
            )}
            {suggestion && (
              <div className="ccai-model-suggestion">
                <div className="ccai-model-suggestion-title">
                  Suggested: {modelNameForId(suggestion.modelId)}
                  {modelProviderForId(suggestion.modelId)
                    ? ` (${modelProviderForId(suggestion.modelId)})`
                    : ''}
                </div>
                {suggestion.rationale && (
                  <p className="ccai-model-suggestion-rationale">{suggestion.rationale}</p>
                )}
                <div className="ccai-model-suggestion-actions">
                  <md-filled-button
                    type="button"
                    onClick={handleAcceptSuggestion}
                  >
                    Use this model
                  </md-filled-button>
                  <md-text-button
                    type="button"
                    onClick={() => setSuggestion(null)}
                  >
                    Dismiss
                  </md-text-button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ccai-expert-input-mode">
          <div className="ccai-tab-row">
            <button
              type="button"
              className={'ccai-tab-btn' + (activeTab === 'freeform' ? ' ccai-tab-btn-active' : '')}
              onClick={() => setActiveTab('freeform')}
              title="One text area for background, bio, and writing samples."
            >
              Freeform
            </button>
            <button
              type="button"
              className={'ccai-tab-btn' + (activeTab === 'structured' ? ' ccai-tab-btn-active' : '')}
              onClick={() => setActiveTab('structured')}
              title="Separate fields for identity, profile, and writing samples."
            >
              Structured
            </button>
          </div>
          <p className="ccai-expert-field-hint">
            Freeform = one box for everything; Structured = separate fields for identity, profile, and samples.
          </p>
        </div>

        <div className="ccai-expert-role-style">
          <div className="ccai-tab-row ccai-tab-row-compact">
            <label
              className="ccai-role-style"
              title="Fills in tone and style from your notes; stays within what you described."
            >
              <input
                type="radio"
                name="role-style"
                checked={roleStyle === 'ai_completed'}
                onChange={() => setRoleStyle('ai_completed')}
              />
              AI-completed
            </label>
            <label
              className="ccai-role-style"
              title="Reorganizes your text only; won't add traits or facts you didn't provide."
            >
              <input
                type="radio"
                name="role-style"
                checked={roleStyle === 'exact'}
                onChange={() => setRoleStyle('exact')}
              />
              Exact (no inferring)
            </label>
          </div>
          <p className="ccai-expert-field-hint">
            AI-completed fills in tone and style from your notes (no new facts); Exact uses only what you typed.
          </p>
        </div>

        {activeTab === 'freeform' ? (
          <div className="ccai-expert-freeform">
            <div className="freeform-label-row">
              <label>Persona description, writing samples, anything you want the LLM to know:</label>
              <md-outlined-button
                type="button"
                className="upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={12} slot="icon" aria-hidden />
                Upload .txt
              </md-outlined-button>
              <input
                type="file"
                accept=".txt,.md"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
            <textarea
              className="freeform-textarea"
              value={freeText}
              placeholder="Drop in any background, transcript, writing samples, biography, etc. Sparse input is fine - the AI-completed mode will fill in plausible details."
              onChange={e => setFreeText(e.target.value)}
            />
          </div>
        ) : (
          <div className="ccai-expert-structured">
            <div className="ccai-expert-field">
              <label>Identity statement</label>
              <input
                type="text"
                value={identity}
                onChange={e => setIdentity(e.target.value)}
                placeholder="One-sentence 'who are you'"
              />
            </div>
            <div className="ccai-expert-field">
              <label>Profile / background</label>
              <textarea
                value={profile}
                onChange={e => setProfile(e.target.value)}
                rows={3}
              />
            </div>
            <div className="ccai-expert-field">
              <label>Writing / speech samples</label>
              <textarea
                value={samples}
                onChange={e => setSamples(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="ccai-expert-actions">
          <md-outlined-button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !name.trim() || !hasDescriptionContent || undefined}
          >
            {busy ? 'Generating role prompt...' : 'Generate role prompt'}
          </md-outlined-button>
        </div>

        <div className="ccai-expert-prompt">
          <label>Role prompt</label>
          <textarea
            value={generatedPrompt}
            onChange={e => {
              setGeneratedPrompt(e.target.value);
              if (suggestMessage) setSuggestMessage('');
              if (suggestion) setSuggestion(null);
            }}
            rows={6}
            placeholder="Generate a role prompt above, or write one here. Suggest a model analyzes this text."
          />
        </div>

        {error && <div className="ccai-expert-error">{error}</div>}
      </div>
    </MdDialog>
  );
}
