import React, { createContext, useContext } from 'react';
import useParticipantsState from '../hooks/useParticipants';

const ParticipantsContext = createContext(null);

export function ParticipantsProvider({ children }) {
  const value = useParticipantsState();
  return (
    <ParticipantsContext.Provider value={value}>
      {children}
    </ParticipantsContext.Provider>
  );
}

export function useParticipants() {
  const ctx = useContext(ParticipantsContext);
  if (!ctx) throw new Error('useParticipants must be used within ParticipantsProvider');
  return ctx;
}
