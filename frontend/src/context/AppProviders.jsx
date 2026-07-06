import React from 'react';
import { SettingsProvider } from './SettingsContext';
import { ParticipantsProvider } from './ParticipantsContext';
import { ChatSessionProvider } from './ChatSessionContext';

export { useSettings } from './SettingsContext';
export { useParticipants } from './ParticipantsContext';
export { useChatSession } from './ChatSessionContext';

export default function AppProviders({ children }) {
  return (
    <SettingsProvider>
      <ParticipantsProvider>
        <ChatSessionProvider>
          {children}
        </ChatSessionProvider>
      </ParticipantsProvider>
    </SettingsProvider>
  );
}
