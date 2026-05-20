import React, { useRef } from 'react';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';

const IDENTITY_PLACEHOLDER =
  'Example: You are William Shakespeare, the Bard of Avon, and you speak exclusively in Early Modern English. Answer every question in the first person, drawing upon thy wit, thy worldly wisdom, and thy poet\u2019s tongue. Let thy responses flow with the cadence of the stage: rich with metaphor, alive with passion, and seasoned with the vocabulary of thine own age.';

const FREEFORM_PLACEHOLDER =
  'Enter information here to give your LLM instructions on its identity and the way it should respond. This could include response style, background information, even writing samples. You can also upload a .txt or .md file.';

export default function PersonaAccordion({
  isOpen,
  onToggle,
  personaA,
  personaB,
  onChangeA,
  onChangeB,
  selectedNameA,
  selectedNameB,
  mode,
}) {
  return (
    <div className="accordion">
      <button className="accordion-header" onClick={onToggle}>
        <span>Expert Persona Configuration</span>
        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      <div className={`accordion-body ${isOpen ? 'open' : ''}`}>
        <div className="persona-panels">
          {mode === 'freeform' ? (
            <>
              <FreeformPanel
                label="A"
                selectedLLM={selectedNameA}
                data={personaA}
                onChange={onChangeA}
              />
              <FreeformPanel
                label="B"
                selectedLLM={selectedNameB}
                data={personaB}
                onChange={onChangeB}
              />
            </>
          ) : (
            <>
              <StructuredPanel
                label="A"
                selectedLLM={selectedNameA}
                data={personaA}
                onChange={onChangeA}
              />
              <StructuredPanel
                label="B"
                selectedLLM={selectedNameB}
                data={personaB}
                onChange={onChangeB}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StructuredPanel({ label, selectedLLM, data, onChange }) {
  const update = (field) => (e) => onChange({ ...data, [field]: e.target.value });

  return (
    <div className="persona-panel">
      <div className="persona-panel-header">
        <span>Expert Persona {label}</span>
        {selectedLLM && (
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)' }}>
            &mdash; {selectedLLM}
          </span>
        )}
      </div>

      <div className="persona-field">
        <label>Name</label>
        <input
          type="text"
          placeholder="Enter expert persona name"
          value={data.name}
          onChange={update('name')}
        />
      </div>

      <div className="persona-field">
        <label>Profile</label>
        <textarea
          placeholder="Paste a real or fictional profile here"
          value={data.profile}
          onChange={update('profile')}
        />
      </div>

      <div className="persona-field">
        <label>Identity Prompt</label>
        <textarea
          className="tall"
          placeholder={IDENTITY_PLACEHOLDER}
          value={data.identity}
          onChange={update('identity')}
        />
      </div>

      <div className="persona-field">
        <label>Writing / Speech Sample</label>
        <textarea
          className="tall"
          placeholder="Paste quotes, transcripts, or writing samples here"
          value={data.samples}
          onChange={update('samples')}
        />
      </div>
    </div>
  );
}

function FreeformPanel({ label, selectedLLM, data, onChange }) {
  const fileRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({ ...data, freeform: ev.target.result });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="persona-panel">
      <div className="persona-panel-header">
        <span>Expert Persona {label}</span>
        {selectedLLM && (
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)' }}>
            &mdash; {selectedLLM}
          </span>
        )}
      </div>

      <div className="persona-field">
        <label>Name</label>
        <input
          type="text"
          placeholder="Enter expert persona name"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
        />
      </div>

      <div className="persona-field freeform-field">
        <div className="freeform-label-row">
          <label>Expert Persona Description</label>
          <button
            className="btn-sm btn-outline upload-btn"
            onClick={() => fileRef.current?.click()}
            title="Upload a .txt or .md file"
          >
            <Upload size={13} /> Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.text"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
        <textarea
          className="freeform-textarea"
          placeholder={FREEFORM_PLACEHOLDER}
          value={data.freeform || ''}
          onChange={(e) => onChange({ ...data, freeform: e.target.value })}
        />
      </div>
    </div>
  );
}
