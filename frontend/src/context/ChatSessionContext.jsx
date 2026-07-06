import React, { createContext, useContext } from 'react';
import useChatSessionState from '../hooks/useChatSession';

const ChatSessionContext = createContext(null);

export function ChatSessionProvider({ children }) {
  const value = useChatSessionState();
  return (
    <ChatSessionContext.Provider value={value}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error('useChatSession must be used within ChatSessionProvider');
  return ctx;
}
