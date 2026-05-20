import React, { useCallback, useState } from 'react';
import { Cloud, ChevronDown, ChevronRight, User } from 'lucide-react';

export default function LLMSelector({ providers, neonModels, selections, onSelectionsChange }) {
  const [openGroups, setOpenGroups] = useState({});

  const toggleGroup = (key) => {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClick = useCallback((modelId) => {
    onSelectionsChange(prev => {
      const isSelected = prev.includes(modelId);
      const isBoth = prev.length === 2 && prev[0] === modelId && prev[1] === modelId;

      if (isBoth) return [];

      if (isSelected) return [modelId, modelId];

      if (prev.length < 2) return [...prev, modelId];

      return [prev[1], modelId];
    });
  }, [onSelectionsChange]);

  const getIndicatorClass = (modelId) => {
    const [a, b] = selections;
    if (a === modelId && b === modelId) return 'select-indicator double-selected';
    if (a === modelId) return 'select-indicator selected-a';
    if (b === modelId) return 'select-indicator selected-b';
    return 'select-indicator';
  };

  const getLabel = (modelId) => {
    const [a, b] = selections;
    if (a === modelId && b === modelId) return 'AB';
    if (a === modelId) return 'A';
    if (b === modelId) return 'B';
    return '';
  };

  const shortName = (name) => name.split('/').pop() || name;

  const renderModel = (model) => (
    <button
      key={model.id}
      className="model-btn"
      onClick={() => handleClick(model.id)}
    >
      <div className={getIndicatorClass(model.id)}>
        {getLabel(model.id) && <span className="selection-label">{getLabel(model.id)}</span>}
      </div>
      <span className="model-name">{model.name}</span>
      {model.params && <span className="model-params">{model.params}</span>}
    </button>
  );

  const renderNeonPersona = (persona) => (
    <button
      key={persona.id}
      className="neon-persona-item"
      onClick={() => handleClick(persona.id)}
    >
      <div className={getIndicatorClass(persona.id)}>
        {getLabel(persona.id) && <span className="selection-label">{getLabel(persona.id)}</span>}
      </div>
      <div className="persona-details">
        <div className="persona-name-row">
          <User size={12} />
          {persona.name}
        </div>
        {persona.systemPrompt && (
          <div className="persona-prompt-preview">
            {persona.systemPrompt.slice(0, 120)}
            {persona.systemPrompt.length > 120 ? '…' : ''}
          </div>
        )}
        {!persona.systemPrompt && (
          <div className="persona-prompt-preview">No system prompt (vanilla)</div>
        )}
      </div>
    </button>
  );

  return (
    <div className="sidebar">
      <h2 className="sidebar-title">AI Models</h2>

      {(neonModels || []).length > 0 && (
        <div className="sidebar-section">
          <h3 className="selector-title">
            <img src="/neon-logo.png" alt="" className="selector-title-icon" />
            Neon.ai Models
          </h3>
          <div className="neon-model-list">
            {[...(neonModels || [])].sort((a, b) => shortName(a.name).localeCompare(shortName(b.name))).map(model => {
              const key = `neon-${model.model_id}`;
              const isOpen = !!openGroups[key];
              const activePersonas = (model.personas || []).filter(p => p.enabled !== false);
              return (
                <div key={key} className="neon-model-card">
                  <button
                    className="neon-model-header"
                    onClick={() => toggleGroup(key)}
                  >
                    <div className="neon-model-info">
                      <span className="neon-model-name">{shortName(model.name)}</span>
                      {model.version && <span className="neon-model-version">v{model.version}</span>}
                    </div>
                    <div className="neon-model-meta">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="neon-persona-list">
                      {activePersonas.map(persona => renderNeonPersona({
                        id: `neon:${model.model_id}:${persona.persona_name}`,
                        name: persona.persona_name,
                        systemPrompt: persona.system_prompt || '',
                      }))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(providers || []).length > 0 && (
        <div className="sidebar-section">
          <h3 className="selector-title">
            <Cloud size={16} />
            Other Models
          </h3>
          {[...(providers || [])].sort((a, b) => a.name.localeCompare(b.name)).map(provider => {
            const key = `prov-${provider.id}`;
            const isOpen = !!openGroups[key];
            return (
              <div key={key} className="provider-group comp-group">
                <button className="provider-accordion-header" onClick={() => toggleGroup(key)}>
                  <span className="provider-accordion-title">{provider.name}</span>
                  <span className="provider-accordion-meta">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="model-list">
                    {provider.models.map(renderModel)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
