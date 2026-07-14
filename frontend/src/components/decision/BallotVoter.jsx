import React, { useState } from 'react';
import NeonAvatar from '../../neon/NeonAvatar';
import { AVATAR_PALETTE, HUMAN_COLOR } from '../../constants/brandColors';

/**
 * Single voter row with avatar + optional expandable reason.
 */
export default function BallotVoter({
  name,
  detail,
  reason,
  voterId,
  speakerIdxFor = {},
  isHuman = false,
}) {
  const [open, setOpen] = useState(false);
  const hasReason = Boolean(reason && String(reason).trim());
  const displayName = name || 'Voter';
  const idx = speakerIdxFor?.[voterId] ?? 0;
  const initial = displayName.charAt(0).toUpperCase();
  const bg = isHuman
    ? HUMAN_COLOR
    : AVATAR_PALETTE[idx % AVATAR_PALETTE.length];

  return (
    <li className="ccai-decision-voter">
      <div className="ccai-decision-voter-main">
        <span className="ccai-decision-voter-avatar" aria-hidden>
          {isHuman ? (
            <NeonAvatar kind="user" size="sm" />
          ) : (
            <NeonAvatar
              kind="initial"
              size="sm"
              label={initial}
              backgroundColor={bg}
            />
          )}
        </span>
        <span className="ccai-decision-voter-name">{displayName}</span>
        {detail ? <span className="ccai-decision-voter-detail">{detail}</span> : null}
        {hasReason ? (
          <button
            type="button"
            className="ccai-decision-reason-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide reason' : 'Reason'}
          </button>
        ) : null}
      </div>
      {open && hasReason ? (
        <p className="ccai-decision-reason">{reason}</p>
      ) : null}
    </li>
  );
}
