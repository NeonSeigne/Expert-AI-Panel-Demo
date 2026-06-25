/**
 * Tiny localStorage shim for the CCAI demo.
 *
 * Single namespace `ccai-vibe-demo` so we never collide with anything else
 * the host page is doing. Schema-versioned so we can migrate if/when the
 * shape changes.
 */

const NS = 'ccai-vibe-demo';
const SCHEMA_VERSION = 1;

/** Demo trio — ids/names mirror backend/app/services/extra_personas.py */
export const DEFAULT_DEMO_PERSONAS = [
  {
    participant_id: 'extra_elena_financial_strategist',
    name: 'Elena — Financial Strategist',
  },
  {
    participant_id: 'extra_marcus_technology_strategist',
    name: 'Marcus — Technology Strategist',
  },
  {
    participant_id: 'extra_amira_security_advisor',
    name: 'Dr. Amira — Security & Privacy Advisor',
  },
];

/** Default panel for first load / empty saved selection (demo trio). */
export const DEFAULT_PARTICIPANT_IDS = DEFAULT_DEMO_PERSONAS.map(
  (p) => p.participant_id,
);

export const DEFAULT_PARTICIPANTS_ENABLED = Object.fromEntries(
  DEFAULT_PARTICIPANT_IDS.map((id) => [id, true]),
);

/** Use saved selection when non-empty; otherwise the demo default trio. */
export function resolveInitialParticipants(persisted) {
  const saved = persisted?.participants_selected;
  if (Array.isArray(saved) && saved.length > 0) {
    return {
      selectedIds: saved,
      enabledMap: persisted.participants_enabled || {},
    };
  }
  return {
    selectedIds: [...DEFAULT_PARTICIPANT_IDS],
    enabledMap: { ...DEFAULT_PARTICIPANTS_ENABLED },
  };
}

const DEFAULTS = {
  schema_version: SCHEMA_VERSION,
  expert_personas: [],
  participants_selected: [...DEFAULT_PARTICIPANT_IDS],
  participants_enabled: { ...DEFAULT_PARTICIPANTS_ENABLED },
  model_assignments: {},
  orchestrator_model_id: null,
  summarizer_model_id: null,
  max_participants: 5,
  theme: null,
  // Sparse map of user overrides to ConversationLimits fields. Empty
  // map = "use server defaults". The server clamps anything we send,
  // so storing whatever the user typed (including stale values from
  // an earlier session) is safe.
  conversation_limits: {},
  // When true, the participants dropdown shows "Select N Automatically"
  // as the active mode and the per-persona checkboxes are hidden.
  // The auto-select happens just before /chat/start.
  auto_select_mode: false,
  // In-the-loop human participant. null when no human is configured.
  // Shape when set:
  //   { participant_id, name, profile_text,
  //     credential_summary: {
  //       name, expertise, personality,
  //       credibility_for_question, bias_to_watch
  //     } }
  // Persisted across page reloads so the user doesn't have to re-author
  // their summary every session. Cleared from storage when the user
  // removes the human via the sidebar.
  human_participant: null,
  // Conversation-format plugin choices (see backend
  // /api/chat/conversation-formats). null means "use server default"
  // — the backend returns `default_structure_id` / `default_decision_id`
  // alongside the catalog so the UI can highlight them.
  conversation_structure_id: null,
  decision_method_id: null,
};

function readAll() {
  try {
    const raw = window.localStorage.getItem(NS);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (parsed.schema_version !== SCHEMA_VERSION) {
      // Future-proofing: migrate or wipe. For v1 we just merge with defaults.
      return { ...DEFAULTS, ...parsed, schema_version: SCHEMA_VERSION };
    }
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    console.warn('localStorage read failed:', err);
    return { ...DEFAULTS };
  }
}

function writeAll(state) {
  try {
    window.localStorage.setItem(NS, JSON.stringify(state));
  } catch (err) {
    console.warn('localStorage write failed:', err);
  }
}

export function loadState() {
  return readAll();
}

export function patchState(patch) {
  const current = readAll();
  const next = { ...current, ...patch };
  writeAll(next);
  return next;
}

export function setExpertPersonas(list) {
  return patchState({ expert_personas: list });
}

export function setParticipantsSelected(ids) {
  return patchState({ participants_selected: ids });
}

export function setParticipantsEnabled(map) {
  return patchState({ participants_enabled: map });
}

export function setModelAssignments(map) {
  return patchState({ model_assignments: map });
}

export function setOrchestratorModelId(modelId) {
  return patchState({ orchestrator_model_id: modelId });
}

export function setSummarizerModelId(modelId) {
  return patchState({ summarizer_model_id: modelId });
}

export function setMaxParticipants(n) {
  return patchState({ max_participants: n });
}

export function setTheme(theme) {
  return patchState({ theme });
}

export function setConversationLimits(limitsMap) {
  return patchState({ conversation_limits: limitsMap || {} });
}

export function setAutoSelectMode(on) {
  return patchState({ auto_select_mode: !!on });
}

export function setHumanParticipant(humanOrNull) {
  return patchState({ human_participant: humanOrNull || null });
}

export function setConversationStructureId(id) {
  return patchState({ conversation_structure_id: id || null });
}

export function setDecisionMethodId(id) {
  return patchState({ decision_method_id: id || null });
}
