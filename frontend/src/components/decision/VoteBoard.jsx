import React from 'react';
import BallotVoter from './BallotVoter';

function yesnoVerdict(tally) {
  if (!tally) return 'No tally';
  if (tally.passes) return 'Passes';
  if (tally.majority === 'tie') return 'Tied';
  return 'Fails';
}

function isHumanBallot(ballot) {
  return Boolean(
    ballot?.is_human
    || ballot?.model_display === 'Human participant',
  );
}

function YesNoBoard({ decision, speakerIdxFor, participantNameById }) {
  const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
  const tally = decision.tally || {};
  const buckets = {
    aye: [],
    nay: [],
    abstain: [],
  };
  for (const b of ballots) {
    const vote = String(b.vote || '').toLowerCase();
    if (vote === 'aye') buckets.aye.push(b);
    else if (vote === 'nay') buckets.nay.push(b);
    else buckets.abstain.push(b);
  }

  const columns = [
    { key: 'aye', label: 'Aye', count: tally.aye ?? buckets.aye.length },
    { key: 'nay', label: 'Nay', count: tally.nay ?? buckets.nay.length },
    { key: 'abstain', label: 'Abstain', count: tally.abstain ?? buckets.abstain.length },
  ];

  return (
    <div className="ccai-decision-vote">
      {decision.motion ? (
        <p className="ccai-decision-motion">
          <span className="ccai-decision-motion-label">Motion</span>
          {decision.motion}
        </p>
      ) : null}
      <div className="ccai-decision-verdict-row">
        <md-assist-chip
          className={`ccai-decision-verdict-chip is-${yesnoVerdict(tally).toLowerCase()}`}
          label={yesnoVerdict(tally)}
        >
          {yesnoVerdict(tally)}
        </md-assist-chip>
        {decision.flavor === 'roberts_rules' ? (
          <span className="ccai-decision-flavor">Robert&apos;s Rules</span>
        ) : null}
      </div>
      <div className="ccai-decision-columns">
        {columns.map((col) => (
          <div key={col.key} className={`ccai-decision-column is-${col.key}`}>
            <div className="ccai-decision-column-header">
              <span>{col.label}</span>
              <strong>{col.count}</strong>
            </div>
            <ul className="ccai-decision-voter-list">
              {buckets[col.key].map((b) => (
                <BallotVoter
                  key={b.voter_id || b.voter_name}
                  name={b.voter_name || participantNameById?.[b.voter_id] || 'Voter'}
                  reason={b.reason}
                  voterId={b.voter_id}
                  speakerIdxFor={speakerIdxFor}
                  isHuman={isHumanBallot(b)}
                />
              ))}
              {buckets[col.key].length === 0 ? (
                <li className="ccai-decision-empty">None</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function PluralityBoard({ decision, speakerIdxFor, participantNameById }) {
  const options = Array.isArray(decision.options) ? decision.options : [];
  const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
  const tally = decision.tally || {};
  const counts = Array.isArray(tally.counts) ? tally.counts : [];
  const winner = tally.winner || 0;
  const maxCount = Math.max(1, ...counts, 0);

  return (
    <div className="ccai-decision-vote">
      <ul className="ccai-decision-option-list">
        {options.map((opt, i) => {
          const choiceNum = i + 1;
          const count = counts[i] ?? 0;
          const voters = ballots.filter((b) => Number(b.choice) === choiceNum);
          const isWinner = winner === choiceNum;
          const isTied = Array.isArray(tally.tied_for_first)
            && tally.tied_for_first.includes(choiceNum);
          return (
            <li
              key={`opt-${choiceNum}`}
              className={[
                'ccai-decision-option',
                isWinner ? 'is-winner' : '',
                isTied ? 'is-tied' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="ccai-decision-option-header">
                <span className="ccai-decision-option-label">
                  {isWinner ? 'Winner · ' : isTied ? 'Tied · ' : ''}
                  {opt}
                </span>
                <strong>{count}</strong>
              </div>
              <div
                className="ccai-decision-bar"
                aria-hidden
              >
                <div
                  className="ccai-decision-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                />
              </div>
              <ul className="ccai-decision-voter-list">
                {voters.map((b) => (
                  <BallotVoter
                    key={b.voter_id || b.voter_name}
                    name={b.voter_name || participantNameById?.[b.voter_id] || 'Voter'}
                    reason={b.reason}
                    voterId={b.voter_id}
                    speakerIdxFor={speakerIdxFor}
                    isHuman={isHumanBallot(b)}
                  />
                ))}
                {voters.length === 0 ? (
                  <li className="ccai-decision-empty">No votes</li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>
      {(tally.abstentions > 0) ? (
        <p className="ccai-decision-meta">
          {tally.abstentions} abstention{tally.abstentions === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}

function RankedChoiceBoard({ decision, speakerIdxFor, participantNameById }) {
  const options = Array.isArray(decision.options) ? decision.options : [];
  const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
  const irv = decision.irv || {};
  const rounds = Array.isArray(irv.rounds) ? irv.rounds : [];
  const winner = irv.winner || 0;

  const labelFor = (n) => {
    const idx = Number(n) - 1;
    if (idx >= 0 && idx < options.length) return options[idx];
    return `Option ${n}`;
  };

  return (
    <div className="ccai-decision-vote">
      {winner > 0 ? (
        <div className="ccai-decision-verdict-row">
          <md-assist-chip className="ccai-decision-verdict-chip is-passes" label="Winner">
            Winner
          </md-assist-chip>
          <span className="ccai-decision-winner-text">{labelFor(winner)}</span>
        </div>
      ) : irv.tied ? (
        <div className="ccai-decision-verdict-row">
          <md-assist-chip className="ccai-decision-verdict-chip is-tied" label="Tied">
            Tied
          </md-assist-chip>
          <span className="ccai-decision-winner-text">No winner under ranked-choice</span>
        </div>
      ) : null}

      <div className="ccai-decision-section-title">Ballots</div>
      <ul className="ccai-decision-ranked-ballots">
        {ballots.map((b) => {
          const ranking = Array.isArray(b.ranking) ? b.ranking : [];
          const detail = ranking.length
            ? ranking.map(labelFor).join(' → ')
            : 'Invalid / empty ranking';
          return (
            <BallotVoter
              key={b.voter_id || b.voter_name}
              name={b.voter_name || participantNameById?.[b.voter_id] || 'Voter'}
              detail={detail}
              reason={b.reason}
              voterId={b.voter_id}
              speakerIdxFor={speakerIdxFor}
              isHuman={isHumanBallot(b)}
            />
          );
        })}
        {ballots.length === 0 ? (
          <li className="ccai-decision-empty">No ballots</li>
        ) : null}
      </ul>

      {rounds.length > 0 ? (
        <>
          <div className="ccai-decision-section-title">Instant-runoff rounds</div>
          <ol className="ccai-decision-irv-rounds">
            {rounds.map((r) => {
              const counts = r.counts || {};
              const countLine = Object.keys(counts)
                .sort((a, b) => Number(a) - Number(b))
                .map((opt) => `${labelFor(opt)}: ${counts[opt]}`)
                .join(' · ');
              return (
                <li key={`irv-${r.round}`} className="ccai-decision-irv-round">
                  <strong>Round {r.round}</strong>
                  <span>{countLine || 'No counts'}</span>
                  {r.eliminated ? (
                    <span className="ccai-decision-irv-note">
                      Eliminated: {labelFor(r.eliminated)}
                    </span>
                  ) : null}
                  {r.winner ? (
                    <span className="ccai-decision-irv-note is-winner">
                      Winner: {labelFor(r.winner)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </div>
  );
}

/**
 * Structured vote board for yes/no, plurality, and ranked-choice results.
 */
export default function VoteBoard({
  decision,
  speakerIdxFor = {},
  participantNameById = {},
}) {
  if (!decision) return null;

  const boardProps = { decision, speakerIdxFor, participantNameById };

  if (decision.kind === 'ranked_choice_result') {
    return <RankedChoiceBoard {...boardProps} />;
  }

  if (decision.vote_kind === 'yesno') {
    return <YesNoBoard {...boardProps} />;
  }

  if (decision.vote_kind === 'plurality' || Array.isArray(decision.options)) {
    return <PluralityBoard {...boardProps} />;
  }

  // Fallback: try yesno shape if ballots have vote fields
  const ballots = Array.isArray(decision.ballots) ? decision.ballots : [];
  if (ballots.some((b) => b.vote != null)) {
    return <YesNoBoard {...boardProps} />;
  }

  return (
    <p className="ccai-decision-empty">No structured vote data available.</p>
  );
}
