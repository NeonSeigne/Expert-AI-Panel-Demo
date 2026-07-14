import React from 'react';
import { useSettings } from '../context/SettingsContext';

/** Scopes neon-design CSS tokens and MD3 bridge to a subtree. */
export default function NeonDesignRoot({ children, className = '' }) {
  const { theme } = useSettings();
  return (
    <div
      className={`neon-design-root${className ? ` ${className}` : ''}`}
      data-theme={theme}
    >
      {children}
    </div>
  );
}
