import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

export default function AuthBadge() {
  const { auth } = useSettings();
  if (!auth) return null;

  if (auth.logged_in) {
    return (
      <div className="auth-badge auth-badge-end">
        <User size={14} />
        <span className="auth-username">{auth.username}</span>
        {auth.is_org_member && <span className="auth-org-tag">org</span>}
        <a href="/oauth/huggingface/logout" className="auth-link" title="Sign out">
          <LogOut size={13} />
        </a>
      </div>
    );
  }

  return (
    <div className="auth-badge auth-badge-end">
      <a href="/oauth/huggingface/login" className="auth-link auth-login">
        Sign in
      </a>
    </div>
  );
}
