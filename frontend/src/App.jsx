import React from 'react';
import AppProviders from './context/AppProviders';
import AppShell from './AppShell';

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
