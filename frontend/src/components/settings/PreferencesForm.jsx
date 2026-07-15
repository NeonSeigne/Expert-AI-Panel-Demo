import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ScrollText, UserPlus } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useParticipants } from '../../context/ParticipantsContext';
import { useChatSession } from '../../context/ChatSessionContext';
import NeonDesignRoot from '../NeonDesignRoot';
import ConversationLimitsForm from '../ConversationLimitsForm';
import PreferenceChoiceCards from './PreferenceChoiceCards';
import MaterialSwitchRow from './material/MaterialSwitchRow';
import MaterialSelectField from './material/MaterialSelectField';
import '../../neon/neon-material.register.js';

/** Material Symbols ligatures keyed by option value id. */
const OPTION_ICONS = {
  model: 'tune',
  speed: 'bolt',
  light: 'light_mode',
  dark: 'dark_mode',
};

function withIcons(options) {
  return (options || []).map((opt) => ({
    ...opt,
    icon: OPTION_ICONS[opt.value] || opt.icon,
  }));
}

/**
 * Shared preferences body for onboarding + Settings modal.
 * when showExtended is true, also render theme / panel size / prompts
 * inside Advanced Preferences.
 *
 * Discussion structure / decision method are owned by Team Presets.
 */
export default function PreferencesForm({
  showExtended = false,
  onRequestClose,
  className = '',
}) {
  const {
    theme,
    toggleTheme,
    allModelsFlat: allModels,
    orchestratorModel,
    handleOrchestratorChange,
    summarizerModel,
    handleSummarizerChange,
    speedPriority,
    handleSpeedPriorityChange,
    showResponseTime,
    setShowResponseTime,
    showChatStats,
    setShowChatStats,
    maxParticipants,
    handleShowPromptCatalog,
    limitsSchema,
    limitsOverrides,
    loadLimitsSchema,
    handleConversationLimitsChange,
    handleConversationLimitsResetAll,
  } = useSettings();

  const {
    selectedParticipants: participants,
    modelAssignments,
    handleModelAssignmentChange,
    handleOpenExpertModal,
    handleMaxParticipantsChange,
  } = useParticipants();

  const {
    hasCredentials,
    handleShowCredentials,
  } = useChatSession();

  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!advancedOpen || limitsSchema) return;
    loadLimitsSchema?.();
  }, [advancedOpen, limitsSchema, loadLimitsSchema]);

  const modelOptions = useMemo(
    () => (allModels || []).map((m) => ({
      value: m.id,
      label: m.provider ? `${m.name} (${m.provider})` : m.name,
    })),
    [allModels],
  );
  const orchOptions = useMemo(
    () => [{ value: '', label: 'Default (backend)' }, ...modelOptions],
    [modelOptions],
  );
  const sumOptions = useMemo(
    () => [{ value: '', label: 'Same as Orchestrator' }, ...modelOptions],
    [modelOptions],
  );
  const personaOptions = useMemo(
    () => [{ value: '', label: '(persona default)' }, ...modelOptions],
    [modelOptions],
  );

  const closeThen = (fn) => () => {
    fn?.();
    onRequestClose?.();
  };

  const handleThemeChange = (next) => {
    if (!toggleTheme) return;
    if ((next === 'dark') !== (theme === 'dark')) {
      toggleTheme();
    }
  };

  return (
    <NeonDesignRoot className="onboarding-form-root">
      <div className={`onboarding-form onboarding-form--preferences ${className}`.trim()}>
        <PreferenceChoiceCards
          label="Response priority"
          value={speedPriority ? 'speed' : 'model'}
          onChange={(v) => handleSpeedPriorityChange?.(v === 'speed')}
          options={withIcons([
            {
              value: 'model',
              label: 'Prioritize model choice',
              description: 'Keep the models you picked; slow or failed turns are noted in chat.',
            },
            {
              value: 'speed',
              label: 'Prioritize conversation speed',
              description: 'Race models against a fast fallback and substitute on failures.',
            },
          ])}
        />

        <div className="onboarding-form-section onboarding-form-section--models">
          <div className="onboarding-form-section-label">Model selection</div>
          <div className="onboarding-form-select-grid">
            <MaterialSelectField
              label="Orchestrator model"
              value={orchestratorModel || ''}
              options={orchOptions}
              onChange={(id) => handleOrchestratorChange(id)}
            />
            <MaterialSelectField
              label="Summarizer model"
              value={summarizerModel || ''}
              options={sumOptions}
              onChange={(id) => handleSummarizerChange(id)}
            />
            {(participants || [])
              .filter((p) => p.kind !== 'human')
              .map((p) => (
                <MaterialSelectField
                  key={p.participant_id}
                  label={p.name}
                  value={modelAssignments[p.participant_id] || ''}
                  options={personaOptions}
                  onChange={(id) => handleModelAssignmentChange(p.participant_id, id)}
                />
              ))}
          </div>
        </div>

        <div className="preferences-advanced">
          <button
            type="button"
            className={
              'preferences-advanced-toggle'
              + (advancedOpen ? ' preferences-advanced-toggle--open' : '')
            }
            aria-expanded={advancedOpen}
            aria-controls="preferences-advanced-panel"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>Advanced Preferences</span>
            <ChevronDown size={18} aria-hidden className="preferences-advanced-chevron" />
          </button>

          {advancedOpen && (
            <div
              id="preferences-advanced-panel"
              className="preferences-advanced-panel"
            >
              {showExtended && (
                <PreferenceChoiceCards
                  label="Theme"
                  value={theme === 'dark' ? 'dark' : 'light'}
                  onChange={handleThemeChange}
                  options={withIcons([
                    {
                      value: 'light',
                      label: 'Light',
                      description: 'Bright surfaces for daytime reading.',
                    },
                    {
                      value: 'dark',
                      label: 'Dark',
                      description: 'Lower glare for focused sessions.',
                    },
                  ])}
                />
              )}

              <div className="onboarding-form-section onboarding-form-section--switches">
                <div className="onboarding-form-section-label">Display options</div>
                <div className="onboarding-form-switch-list">
                  <MaterialSwitchRow
                    label="Response times on messages"
                    selected={!!showResponseTime}
                    onChange={(v) => setShowResponseTime(v)}
                  />
                  <MaterialSwitchRow
                    label="Chat stats after end"
                    selected={!!showChatStats}
                    onChange={(v) => setShowChatStats(v)}
                  />
                </div>
              </div>

              {showExtended && (
                <div className="onboarding-form-section">
                  <div className="onboarding-form-section-label">
                    Max participants ({maxParticipants})
                  </div>
                  <div className="ccai-stepper-row preferences-stepper-row">
                    <md-outlined-button
                      type="button"
                      className="ccai-stepper-btn"
                      disabled={maxParticipants <= 3 || undefined}
                      onClick={() => handleMaxParticipantsChange(Math.max(3, maxParticipants - 1))}
                    >
                      −
                    </md-outlined-button>
                    <div className="ccai-stepper-val">{maxParticipants}</div>
                    <md-outlined-button
                      type="button"
                      className="ccai-stepper-btn"
                      disabled={maxParticipants >= 9 || undefined}
                      onClick={() => handleMaxParticipantsChange(Math.min(9, maxParticipants + 1))}
                    >
                      +
                    </md-outlined-button>
                    <span className="dev-panel-hint">3–9</span>
                  </div>
                </div>
              )}

              {showExtended && (
                <button
                  type="button"
                  className="preferences-action-row"
                  onClick={closeThen(() => handleOpenExpertModal(null))}
                >
                  <UserPlus size={16} aria-hidden />
                  Create Expert Persona…
                </button>
              )}

              <div className="onboarding-form-section">
                <div className="onboarding-form-section-label">Conversation limits</div>
                <p className="preferences-advanced-lede">
                  Control how long each phase runs and when the conversation
                  pauses for a Continue confirmation.
                </p>
                <ConversationLimitsForm
                  schema={limitsSchema}
                  overrides={limitsOverrides}
                  onChange={handleConversationLimitsChange}
                  onResetAll={handleConversationLimitsResetAll}
                  showResetAll
                  embedded
                />
              </div>

              {showExtended && (
                <div className="onboarding-form-section">
                  <div className="onboarding-form-section-label">View prompts</div>
                  <button
                    type="button"
                    className="preferences-action-row"
                    disabled={!hasCredentials}
                    onClick={closeThen(handleShowCredentials)}
                    title={
                      hasCredentials
                        ? "View the orchestrator's per-participant Credential Summary"
                        : 'Credential Summary is built after Phase 1. Start a chat first.'
                    }
                  >
                    <ScrollText size={16} aria-hidden />
                    View Credential Summary…
                  </button>
                  <button
                    type="button"
                    className="preferences-action-row"
                    onClick={closeThen(handleShowPromptCatalog)}
                    title="View every prompt template the orchestrator and participants use."
                  >
                    <BookOpen size={16} aria-hidden />
                    View current chat prompts…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </NeonDesignRoot>
  );
}
