import React from 'react';
import { User } from 'lucide-react';
import OnboardingChatGraphic from './OnboardingChatGraphic';
import OnboardingStepHeading from './OnboardingStepHeading';
import { HUMAN_TONE, PARTICIPANT_PALETTE } from '../../constants/brandColors';

const HUMAN_MESSAGES = [
  {
    side: 'Agent',
    content:
      'Join the panel as a human participant. The orchestrator will pause for your input when it\'s your turn — the same way other members speak.',
    bubbleColor: PARTICIPANT_PALETTE[0].bg,
    avatarKind: 'initial',
    avatarLabel: 'O',
    avatarColor: PARTICIPANT_PALETTE[0].color,
  },
  {
    side: 'User',
    content: 'You can always add or remove yourself later.',
    bubbleColor: HUMAN_TONE.bg,
    textColor: '#1F1F1F',
    avatarKind: 'user',
    avatarLabel: 'Y',
    avatarColor: HUMAN_TONE.color,
  },
];

export default function OnboardingStepHuman({
  includeSelf,
  onIncludeSelfChange,
  name,
  onNameChange,
  profileText,
  onProfileTextChange,
}) {
  return (
    <div className="onboarding-step onboarding-step--human">
      <OnboardingStepHeading icon={<User size={36} strokeWidth={1.75} />}>
        Do you want to be included?
      </OnboardingStepHeading>
      <OnboardingChatGraphic
        className="onboarding-chat-graphic--compact"
        messages={HUMAN_MESSAGES}
      />

      <div className="onboarding-choice-cards" role="group" aria-label="Include yourself">
        <button
          type="button"
          className={
            'onboarding-choice-card'
            + (includeSelf === true ? ' onboarding-choice-card--active' : '')
          }
          onClick={() => onIncludeSelfChange(true)}
          aria-pressed={includeSelf === true}
        >
          <strong>Yes</strong>
          <span>I&apos;ll take a seat and weigh in when asked.</span>
        </button>
        <button
          type="button"
          className={
            'onboarding-choice-card'
            + (includeSelf === false ? ' onboarding-choice-card--active' : '')
          }
          onClick={() => onIncludeSelfChange(false)}
          aria-pressed={includeSelf === false}
        >
          <strong>No</strong>
          <span>Just the AI panel for now.</span>
        </button>
      </div>

      {includeSelf === true && (
        <div className="onboarding-human-form">
          <label className="ccai-human-field">
            <span className="ccai-human-field-label">Name</span>
            <input
              type="text"
              className="ccai-human-input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Pat, Dr. Lopez, …"
            />
          </label>
          <label className="ccai-human-field">
            <span className="ccai-human-field-label">
              Experience, personality, …
            </span>
            <textarea
              className="ccai-human-summary"
              value={profileText}
              onChange={(e) => onProfileTextChange(e.target.value)}
              rows={6}
              spellCheck
              placeholder={
                'Describe your background, how you tend to argue, '
                + 'and anything the group should know about your perspective…'
              }
            />
            <div className="ccai-human-summary-help">
              The orchestrator turns this into a credential summary for
              the group — the same way it assesses each LLM persona.
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
