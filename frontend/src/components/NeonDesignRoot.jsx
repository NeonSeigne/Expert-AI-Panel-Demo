import React from 'react';

/**
 * Layout / component host for Neon MD chrome.
 * Theme tokens live on html[data-theme] (md3-theme.css) — no local data-theme.
 */
export default function NeonDesignRoot({ children, className = '' }) {
  return (
    <div className={`neon-design-root${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
