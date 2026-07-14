import React from 'react';
import { LogOut, User } from 'lucide-react';
import '../neon/neon-material.register.js';
import { useSettings } from '../context/SettingsContext';

export default function AuthBadge() {
  const { auth } = useSettings();
  if (!auth) return null;

  if (auth.logged_in) {
    return (
      <div className="auth-badge auth-badge-end auth-badge--material">
        <span className="auth-badge-user">
          <User size={14} aria-hidden />
          <span className="auth-username">{auth.username}</span>
          {auth.is_org_member && <span className="auth-org-tag">org</span>}
        </span>
        <md-outlined-icon-button
          href="/oauth/huggingface/logout"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} strokeWidth={2} aria-hidden />
        </md-outlined-icon-button>
      </div>
    );
  }

  return (
    <div className="auth-badge auth-badge-end auth-badge--material">
      <md-text-button href="/oauth/huggingface/login">
        Sign in
      </md-text-button>
    </div>
  );
}
