const API_BASE = process.env.REACT_APP_API_URL !== undefined
  ? process.env.REACT_APP_API_URL
  : 'http://localhost:8000';

export async function fetchModels() {
  const resp = await fetch(`${API_BASE}/api/models`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch models: ${resp.status}`);
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

export async function startChat(
  { persona_a_model_id, persona_a_name, persona_a_role,
    persona_b_model_id, persona_b_name, persona_b_role,
    starter_text },
  { onSession, onMessage, onSystem, onStatus, onError, onDone },
  abortSignal
) {
  const resp = await fetch(`${API_BASE}/api/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      persona_a_model_id, persona_a_name, persona_a_role,
      persona_b_model_id, persona_b_name, persona_b_role,
      starter_text: starter_text || null,
    }),
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
          switch (eventType) {
            case 'session': onSession?.(parsed); break;
            case 'message': onMessage?.(parsed); break;
            case 'system': onSystem?.(parsed); break;
            case 'status': onStatus?.(parsed); break;
            case 'error': onError?.(parsed); break;
            case 'done': onDone?.(); break;
            default: break;
          }
        } catch (e) {
          console.warn('SSE parse error', e, data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  onDone?.();
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

export async function getAuthStatus() {
  const resp = await fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' });
  if (!resp.ok) return { logged_in: false, remaining_conversations: -1 };
  return resp.json();
}

export async function getRateLimitStatus() {
  const resp = await fetch(`${API_BASE}/api/rate-limit/status`, { credentials: 'include' });
  if (!resp.ok) return { remaining: -1 };
  return resp.json();
}
