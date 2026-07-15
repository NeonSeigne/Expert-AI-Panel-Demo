import React from 'react';
import { useParticipants } from '../context/ParticipantsContext';
import { TEAMS } from '../config/teams';

/**
 * Empty-state row of Team Preset buttons (replaces individual participant pills).
 */
export default function WelcomeParticipantPills() {
  const { activeTeamId, applyTeamPreset } = useParticipants();

  return (
    <div
      className="welcome-participant-pills"
      role="group"
      aria-label="Team presets"
    >
      {TEAMS.map((team) => {
        const selected = activeTeamId === team.id;
        return (
          <button
            key={team.id}
            type="button"
            className={
              'welcome-participant-pill welcome-participant-pill--team'
              + (selected ? ' welcome-participant-pill--team-selected' : '')
            }
            aria-pressed={selected}
            title={`Select ${team.name}`}
            onClick={() => applyTeamPreset(team.id)}
          >
            {team.name}
          </button>
        );
      })}
    </div>
  );
}
