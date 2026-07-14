import React from 'react';
import { MessagesSquare } from 'lucide-react';
import OnboardingChatGraphic from './OnboardingChatGraphic';
import OnboardingStepHeading from './OnboardingStepHeading';
import { HUMAN_TONE, PARTICIPANT_PALETTE } from '../../constants/brandColors';

const INTRO_MESSAGES = [
  {
    side: 'Agent',
    content:
      'Multiple AI personas — each with its own model and perspective — discuss your question together.',
    bubbleColor: PARTICIPANT_PALETTE[0].bg,
    avatarKind: 'initial',
    avatarLabel: 'P',
    avatarColor: PARTICIPANT_PALETTE[0].color,
  },
  {
    side: 'Agent',
    content:
      'An orchestrator guides the conversation through structured rounds, critiques, and a chosen decision method until the group reaches an outcome.',
    bubbleColor: PARTICIPANT_PALETTE[2].bg,
    avatarKind: 'initial',
    avatarLabel: 'O',
    avatarColor: PARTICIPANT_PALETTE[2].color,
  },
  {
    side: 'User',
    content:
      "You can optionally join as a human participant. When it's your turn, the panel pauses so you can contribute in the chat.",
    bubbleColor: HUMAN_TONE.bg,
    textColor: '#1F1F1F',
    avatarKind: 'user',
    avatarLabel: 'Y',
    avatarColor: HUMAN_TONE.color,
  },
];

export default function OnboardingStepIntro() {
  return (
    <div className="onboarding-step onboarding-step--intro">
      <OnboardingStepHeading icon={<MessagesSquare size={36} strokeWidth={1.75} />}>
        How it works
      </OnboardingStepHeading>
      <OnboardingChatGraphic messages={INTRO_MESSAGES} />
    </div>
  );
}
