const API_BASE = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:8000';

export async function fetchModels() {
  const resp = await fetch(`${API_BASE}/api/models`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch models: ${resp.status}`);
  return resp.json();
}

export async function fetchPersonas() {
  const resp = await fetch(`${API_BASE}/api/personas`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch personas: ${resp.status}`);
  return resp.json();
}

export async function fetchDemoQuestions() {
  const resp = await fetch(`${API_BASE}/api/demo-questions`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch demo questions: ${resp.status}`);
  return resp.json();
}

export async function generateRole({ model_id, name, profile, identity, samples, role_style }) {
  const resp = await fetch(`${API_BASE}/api/chat/generate-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id, name, profile, identity, samples, role_style }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Role generation failed');
  }
  return resp.json();
}

export async function generateRoleFreeform({ model_id, name, text, role_style }) {
  const resp = await fetch(`${API_BASE}/api/chat/generate-role-freeform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id, name, text, role_style }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Role generation failed');
  }
  return resp.json();
}

/**
 * Start a CCAI conversation and consume the SSE stream.
 *
 * Body: { question, participants[], expert_personas[], model_assignments,
 *         orchestrator_model_id, summarizer_model_id, max_participants }
 */
export async function startChat(body, handlers, abortSignal) {
  const resp = await fetch(`${API_BASE}/api/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Chat start failed');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (abortSignal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const lines = part.trim().split('\n');
        let eventType = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) data = line.slice(6);
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          const handler = handlers[eventHandlerKey(eventType)];
          if (handler) handler(parsed);
        } catch (e) {
          console.warn('SSE parse error', e, data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  handlers.onDone?.();
}

function eventHandlerKey(eventType) {
  switch (eventType) {
    case 'session': return 'onSession';
    case 'message': return 'onMessage';
    case 'orchestrator': return 'onOrchestrator';
    case 'system': return 'onSystem';
    case 'status': return 'onStatus';
    case 'error': return 'onError';
    case 'done': return 'onDone';
    case 'failsafe_pause': return 'onFailsafePause';
    case 'orchestrator_cap_pause': return 'onOrchestratorCapPause';
    case 'participant_error': return 'onParticipantError';
    case 'credentials_updated': return 'onCredentialsUpdated';
    default: return null;
  }
}

export async function continueChat(sessionId, reason) {
  const resp = await fetch(
    `${API_BASE}/api/chat/${sessionId}/continue?reason=${encodeURIComponent(reason)}`,
    { method: 'POST' },
  );
  if (!resp.ok) throw new Error('Continue failed');
  return resp.json();
}

export async function getOrchestrator() {
  const resp = await fetch(`${API_BASE}/api/chat/orchestrator`);
  if (!resp.ok) throw new Error('Failed to get orchestrator');
  return resp.json();
}

export async function setOrchestrator(modelId) {
  const resp = await fetch(`${API_BASE}/api/chat/orchestrator`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId }),
  });
  if (!resp.ok) throw new Error('Failed to set orchestrator');
  return resp.json();
}

export async function getSpeedPriority() {
  const resp = await fetch(`${API_BASE}/api/chat/speed-priority`);
  if (!resp.ok) throw new Error('Failed to get speed priority');
  return resp.json();
}

export async function setSpeedPriority(enabled) {
  const resp = await fetch(`${API_BASE}/api/chat/speed-priority`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!resp.ok) throw new Error('Failed to set speed priority');
  return resp.json();
}

export async function exportChat(sessionId, fmt = 'txt') {
  const resp = await fetch(`${API_BASE}/api/chat/${sessionId}/export?fmt=${fmt}`);
  if (!resp.ok) throw new Error('Export failed');
  return resp.json();
}

export async function exportApiLog(sessionId) {
  const resp = await fetch(`${API_BASE}/api/chat/${sessionId}/api-log`);
  if (!resp.ok) throw new Error('API log export failed');
  return resp.json();
}

export async function fetchTableView(sessionId) {
  const resp = await fetch(`${API_BASE}/api/chat/${sessionId}/table`);
  if (!resp.ok) throw new Error('Table view fetch failed');
  return resp.json();
}

export async function fetchCredentials(sessionId) {
  const resp = await fetch(
    `${API_BASE}/api/chat/${sessionId}/credentials`,
    { cache: 'no-store' },
  );
  if (!resp.ok) throw new Error('Credentials fetch failed');
  return resp.json();
}

export async function getAuthStatus() {
  const resp = await fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' });
  if (!resp.ok) return { logged_in: false, remaining_conversations: -1 };
  return resp.json();
}

export async function getRateLimitStatus() {
  const resp = await fetch(`${API_BASE}/api/rate-limit/status`, { credentials: 'include' });
  if (!resp.ok) return { remaining: -1, daily_limit: 30 };
  return resp.json();
}
