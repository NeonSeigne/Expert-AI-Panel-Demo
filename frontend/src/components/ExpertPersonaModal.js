import React, { useState, useEffect, useRef } from 'react';
import { Upload, Save, Trash2 } from 'lucide-react';
import { generateRole, generateRoleFreeform } from '../utils/api';

/**
 * Single source of truth for creating Expert Personas. Replaces the
 * inline PersonaAccordion + DevMenu persona-mode/role-style settings
 * from LLMChats3 - those choices now live inside this modal.
 *
 * Tabs: Structured | Freeform
 * Role-style toggle: AI-completed | Exact (matches LLMChats3 semantics)
 * Freeform tab supports a file upload for writing samples.
 */
export default function ExpertPersonaModal({
  isOpen,
  initial,                   // existing persona to edit, or null for new
  onClose,
  onSave,
  onDelete,
  allModels,                 // [{ id, name, provider }]
  defaultModelId,
}) {
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
  const fileInputRef = useRef(null);

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
      setModelId(initial.model_id || defaultModelId || '');
      setGeneratedPrompt(initial.role_prompt || '');
    } else {
      setActiveTab('freeform');
      setName('');
      setProfile('');
      setIdentity('');
      setSamples('');
      setFreeText('');
      setRoleStyle('ai_completed');
      setModelId(defaultModelId || '');
      setGeneratedPrompt('');
    }
    setError('');
  }, [isOpen, initial, defaultModelId]);

  if (!isOpen) return null;

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
    if (!modelId) {
      setError('Pick a model to power this persona first.');
      return;
    }
    if (!name.trim()) {
      setError('Persona needs a name.');
      return;
    }
    setBusy(true);
    try {
      const result = activeTab === 'freeform'
        ? await generateRoleFreeform({
          model_id: modelId,
          name: name.trim(),
          text: freeText,
          role_style: roleStyle,
        })
        : await generateRole({
          model_id: modelId,
          name: name.trim(),
          profile,
          identity,
          samples,
          role_style: roleStyle,
        });
      setGeneratedPrompt(result.role_prompt || '');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content ccai-expert-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{initial ? `Edit Expert Persona: ${initial.name}` : 'Create Expert Persona'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
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
            <div className="ccai-expert-field">
              <label>Powered by LLM</label>
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
            </div>
          </div>

          <div className="ccai-tab-row">
            <button
              className={'ccai-tab-btn' + (activeTab === 'freeform' ? ' ccai-tab-btn-active' : '')}
              onClick={() => setActiveTab('freeform')}
            >
              Freeform
            </button>
            <button
              className={'ccai-tab-btn' + (activeTab === 'structured' ? ' ccai-tab-btn-active' : '')}
              onClick={() => setActiveTab('structured')}
            >
              Structured
            </button>
            <div className="ccai-tab-spacer" />
            <label className="ccai-role-style">
              <input
                type="radio"
                name="role-style"
                checked={roleStyle === 'ai_completed'}
                onChange={() => setRoleStyle('ai_completed')}
              />
              AI-completed
            </label>
            <label className="ccai-role-style">
              <input
                type="radio"
                name="role-style"
                checked={roleStyle === 'exact'}
                onChange={() => setRoleStyle('exact')}
              />
              Exact (no inferring)
            </label>
          </div>

          {activeTab === 'freeform' ? (
            <div className="ccai-expert-freeform">
              <div className="freeform-label-row">
                <label>Persona description, writing samples, anything you want the LLM to know:</label>
                <button
                  className="btn-sm btn-outline upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} /> Upload .txt
                </button>
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
            <button
              className="btn-secondary"
              onClick={handleGenerate}
              disabled={busy || !modelId || !name.trim()}
            >
              {busy ? 'Generating role prompt...' : 'Generate role prompt'}
            </button>
          </div>

          {generatedPrompt && (
            <div className="ccai-expert-prompt">
              <label>Generated role prompt (editable)</label>
              <textarea
                value={generatedPrompt}
                onChange={e => setGeneratedPrompt(e.target.value)}
                rows={6}
              />
            </div>
          )}

          {error && <div className="ccai-expert-error">{error}</div>}

          <div className="ccai-expert-footer">
            {initial && onDelete && (
              <button
                className="btn-sm ccai-remove-btn"
                onClick={() => onDelete(initial.participant_id)}
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
            <div className="ccai-tab-spacer" />
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!canSave}
              onClick={handleSave}
            >
              <Save size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {initial ? 'Save changes' : 'Save persona'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
