import React from 'react';

/** Circular icon + step title in a centered horizontal row. */
export default function OnboardingStepHeading({
  id = 'onboarding-title',
  icon,
  children,
}) {
  return (
    <div className="onboarding-step-heading">
      {icon ? (
        <div className="onboarding-step-heading-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 id={id} className="onboarding-step-title">
        {children}
      </h2>
    </div>
  );
}
