/** Named team presets for the empty-state composer + sidebar roster. */

export const MARKETING_PARTICIPANT_IDS = [
  'extra_marketing_project_manager',
  'extra_marketing_newsletter_writer',
  'extra_marketing_social_media_expert',
  'extra_marketing_website_expert',
  'extra_marketing_linkedin_expert',
  'extra_marketing_creative_director',
];

export const DEFAULT_STRATEGY_PARTICIPANT_IDS = [
  'extra_elena_financial_strategist',
  'extra_marcus_technology_strategist',
  'extra_amira_security_advisor',
];

export const TEAMS = [
  {
    id: 'marketing',
    name: 'Marketing Team',
    participantIds: [...MARKETING_PARTICIPANT_IDS],
    conversationStructureId: 'document_pipeline',
    decisionMethodId: 'document_publish',
  },
  {
    id: 'default_strategy',
    name: 'Default Strategy Team',
    participantIds: [...DEFAULT_STRATEGY_PARTICIPANT_IDS],
    conversationStructureId: 'collaborative',
    decisionMethodId: 'consensus',
  },
];

export const DEFAULT_TEAM_ID = 'default_strategy';

export function getTeamById(teamId) {
  return TEAMS.find((t) => t.id === teamId) || null;
}

/** Infer active team from a selected id list (exact set match). */
export function inferTeamIdFromSelection(selectedIds) {
  const set = new Set(selectedIds || []);
  for (const team of TEAMS) {
    if (
      team.participantIds.length === set.size
      && team.participantIds.every((id) => set.has(id))
    ) {
      return team.id;
    }
  }
  return null;
}
