import React from 'react';
import { LogIn, LogOut, User } from 'lucide-react';

export default function AuthBadge({ auth, dailyLimit }) {
  if (!auth) return null;
  const cap = dailyLimit || 30;

  if (auth.logged_in) {
    return (
      <div className="auth-badge">
        <User size={14} />
        <span className="auth-username">{auth.username}</span>
        {auth.is_org_member && <span className="auth-org-tag">org</span>}
        {!auth.is_org_member && auth.remaining_conversations >= 0 && (
          <span className="auth-remaining">{auth.remaining_conversations} left</span>
        )}
        <a href="/oauth/huggingface/logout" className="auth-link" title="Sign out">
          <LogOut size={13} />
        </a>
      </div>
    );
  }

  return (
    <div className="auth-badge">
      {auth.remaining_conversations >= 0 && (
        <span className="auth-remaining">{auth.remaining_conversations}/{cap} chats</span>
      )}
      <a href="/oauth/huggingface/login" className="auth-link auth-login">
        <LogIn size={13} /> Sign in
      </a>
    </div>
  );
}
