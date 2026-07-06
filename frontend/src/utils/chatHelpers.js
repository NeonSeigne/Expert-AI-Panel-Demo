/** True when the user is subject to the per-IP daily chat cap. */
export function isRateLimitedUser(auth) {
  return auth && !auth.is_org_member && auth.remaining_conversations >= 0;
}

/** Append a system note at the current point in the chat timeline (not end-of-feed). */
export function appendInlineChatNote(setMessages, text, extra = {}) {
  setMessages(prev => [...prev, {
    role: 'system',
    text,
    timestamp: Date.now() / 1000,
    ...extra,
  }]);
}
