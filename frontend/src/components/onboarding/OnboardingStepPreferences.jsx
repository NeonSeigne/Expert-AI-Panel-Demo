import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import PreferencesForm from '../settings/PreferencesForm';
import OnboardingChatGraphic from './OnboardingChatGraphic';
import OnboardingStepHeading from './OnboardingStepHeading';
import { PARTICIPANT_PALETTE } from '../../constants/brandColors';

const PREFERENCE_MESSAGES = [
  {
    side: 'Agent',
    content:
      'Choose how the panel discusses and decides — collaborative rounds or formal procedure.',
    bubbleColor: PARTICIPANT_PALETTE[0].bg,
    avatarKind: 'initial',
    avatarLabel: 'O',
    avatarColor: PARTICIPANT_PALETTE[0].color,
  },
  {
    side: 'Agent',
    content:
      'Defaults work well for a first demo. Open Advanced Preferences for finer limits.',
    bubbleColor: PARTICIPANT_PALETTE[2].bg,
    avatarKind: 'initial',
    avatarLabel: 'P',
    avatarColor: PARTICIPANT_PALETTE[2].color,
  },
];

export default function OnboardingStepPreferences() {
  return (
    <div className="onboarding-step onboarding-step--preferences">
      <OnboardingStepHeading icon={<SlidersHorizontal size={36} strokeWidth={1.75} />}>
        Configure preferences
      </OnboardingStepHeading>
      <div className="onboarding-step-preferences-scroll">
        <OnboardingChatGraphic
          className="onboarding-chat-graphic--compact"
          messages={PREFERENCE_MESSAGES}
        />
        <p className="onboarding-step-lede">
          Tune how the panel discusses and decides. Defaults work well for a
          first demo — change only what you need.
        </p>
        <PreferencesForm />
      </div>
    </div>
  );
}
