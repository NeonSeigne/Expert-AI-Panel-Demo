import React, { createContext, useContext } from 'react';
import useSettingsState from '../hooks/useSettings';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const value = useSettingsState();
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
