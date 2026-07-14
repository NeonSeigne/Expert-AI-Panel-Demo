import React from 'react';
import { Users } from 'lucide-react';
import OnboardingChatGraphic from './OnboardingChatGraphic';
import OnboardingStepHeading from './OnboardingStepHeading';
import { PARTICIPANT_PALETTE } from '../../constants/brandColors';

const WELCOME_MESSAGES = [
  {
    side: 'Agent',
    content: 'Welcome to the Neon Collaborative Conversational AI demo',
    bubbleColor: PARTICIPANT_PALETTE[0].bg,
    avatarKind: 'initial',
    avatarLabel: 'N',
    avatarColor: PARTICIPANT_PALETTE[0].color,
  },
  {
    side: 'Agent',
    content:
      "In a few steps you'll pick who sits on the panel and how the discussion runs — then ask anything!",
    bubbleColor: PARTICIPANT_PALETTE[1].bg,
    avatarKind: 'initial',
    avatarLabel: 'A',
    avatarColor: PARTICIPANT_PALETTE[1].color,
  },
];

export default function OnboardingStepWelcome() {
  return (
    <div className="onboarding-step onboarding-step--welcome">
      <img
        src="/neon-logo.png"
        alt="Neon.ai"
        className="onboarding-brand-logo"
      />
      <OnboardingStepHeading icon={<Users size={36} strokeWidth={1.75} />}>
        Configure your AI panel
      </OnboardingStepHeading>
      <OnboardingChatGraphic messages={WELCOME_MESSAGES} />
    </div>
  );
}
