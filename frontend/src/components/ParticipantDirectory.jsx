import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useParticipants } from '../context/ParticipantsContext';
import ParticipantDirectoryCard from './ParticipantDirectoryCard';
import { avatarColorForParticipant } from '../utils/participantAvatar';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const TABS = [
  { id: 'core', label: 'Core Assistants' },
  { id: 'extra', label: 'Extra Personas' },
  { id: 'all', label: 'All' },
];

const AUTO_PICK_COUNT = 5;

function pickRandomParticipantIds(pool, count) {
  const ids = pool.map((p) => p.participant_id);
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function matchesSearch(participant, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    participant.name,
    participant.model_display,
    participant.default_model_id,
    participant.participant_id,
    participant.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function modelLabelFor(participant, modelAssignments, allModelsFlat) {
  const assigned = modelAssignments?.[participant.participant_id];
  if (assigned) {
    const m = allModelsFlat?.find((x) => x.id === assigned);
    return m ? `${m.name} (${assigned})` : assigned;
  }
  return participant.model_display || participant.default_model_id || participant.model_id || '—';
}

function ParticipantDetailPane({
  participant,
  colorIndex = 0,
  modelAssignments,
  allModelsFlat,
  onBack,
  showBack,
}) {
  if (!participant) {
    return (
      <div className="participant-directory-detail participant-directory-detail--empty">
        <p>Select a persona to view LLM details and prompt.</p>
      </div>
    );
  }

  const prompt = (participant.role_prompt || '').trim();
  const description = (participant.description || '').trim();
  const initial = (participant.name || '?').charAt(0).toUpperCase();
  const modelLabel = modelLabelFor(participant, modelAssignments, allModelsFlat);

  return (
    <div className="participant-directory-detail">
      {showBack && (
        <button
          type="button"
          className="participant-directory-detail-back"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden />
          Back to directory
        </button>
      )}
      <div className="participant-directory-detail-scroll">
        <div className="participant-directory-detail-inner">
          <div className="participant-directory-detail-hero">
            <div
              className="participant-directory-detail-avatar"
              style={{ background: avatarColorForParticipant(participant, colorIndex) }}
              aria-hidden
            >
              {initial}
            </div>
            <h3 className="participant-directory-detail-name">{participant.name}</h3>
            <p className="participant-directory-detail-subtitle">{modelLabel}</p>
          </div>
          <div className="participant-directory-detail-content">
            <div className="participant-directory-detail-group">
              <div className="participant-directory-detail-row">
                <span className="participant-directory-detail-label">Model</span>
                <span className="participant-directory-detail-value">{modelLabel}</span>
              </div>
              <div className="participant-directory-detail-row">
                <span className="participant-directory-detail-label">Participant ID</span>
                <span className="participant-directory-detail-value participant-directory-detail-id">
                  {participant.participant_id}
                </span>
              </div>
            </div>
            {description && (
              <div className="participant-directory-detail-group">
                <div className="participant-directory-detail-row">
                  <span className="participant-directory-detail-label">Description</span>
                  <span className="participant-directory-detail-value">{description}</span>
                </div>
              </div>
            )}
            <div className="participant-directory-detail-group">
              <div className="participant-directory-detail-row participant-directory-detail-row--prompt">
                <span className="participant-directory-detail-label">Persona prompt</span>
                {prompt ? (
                  <p className="participant-directory-detail-value participant-directory-detail-prompt">
                    {prompt}
                  </p>
                ) : (
                  <p className="participant-directory-detail-empty">No prompt available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Searchable persona directory (tabs + grid + detail pane).
 * Controlled selection via stagedIds / onStagedIdsChange.
 */
export default function ParticipantDirectory({
  stagedIds,
  onStagedIdsChange,
  embedded = false,
  onCreateExpert,
  focusParticipantId = null,
  autoFocusSearch = false,
  showAutoPick = false,
  onAutoPick,
}) {
  const { maxParticipants, allModelsFlat } = useSettings();
  const {
    catalog,
    expertPersonas,
    modelAssignments,
    autoSelectMode,
    humanParticipant,
  } = useParticipants();

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [focusedParticipant, setFocusedParticipant] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const searchRef = useRef(null);
  const isMobileLayout = useMediaQuery('(max-width: 768px)');

  const humanReserved = humanParticipant ? 1 : 0;
  const selectionCap = Math.max(0, maxParticipants - humanReserved);

  const tabLists = useMemo(() => {
    const core = catalog?.neon || [];
    const extra = catalog?.extra || [];
    const expert = expertPersonas || [];
    return {
      core,
      extra,
      all: [...core, ...extra, ...expert],
    };
  }, [catalog, expertPersonas]);

  const pickInitialTab = useCallback(() => {
    if ((tabLists.all || []).length > 0) return 'all';
    if ((tabLists.core || []).length > 0) return 'core';
    if ((tabLists.extra || []).length > 0) return 'extra';
    return 'all';
  }, [tabLists]);

  // One-shot init on mount (parent remounts via key when reopening)
  useEffect(() => {
    setActiveTab(pickInitialTab());

    if (focusParticipantId) {
      const participant = (tabLists.all || []).find(
        (p) => p.participant_id === focusParticipantId,
      );
      if (participant) {
        setActiveTab('all');
        setFocusedParticipant(participant);
        setMobileDetailOpen(true);
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-participant-id="${focusParticipantId}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return;
      }
    }

    if (autoFocusSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init
  }, []);

  useEffect(() => {
    const currentList = tabLists[activeTab] || [];
    if (currentList.length > 0) return;
    const fallback = pickInitialTab();
    if (fallback !== activeTab && (tabLists[fallback] || []).length > 0) {
      setActiveTab(fallback);
    }
  }, [tabLists, activeTab, pickInitialTab]);

  const filteredList = useMemo(() => {
    const list = tabLists[activeTab] || [];
    return list.filter((p) => matchesSearch(p, search.trim()));
  }, [tabLists, activeTab, search]);

  const stagedSet = useMemo(() => new Set(stagedIds), [stagedIds]);
  const atCap = stagedIds.length >= selectionCap;

  const handleToggleSelect = useCallback((participant) => {
    const id = participant.participant_id;
    const next = stagedIds.includes(id)
      ? stagedIds.filter((x) => x !== id)
      : (stagedIds.length >= selectionCap ? stagedIds : [...stagedIds, id]);
    onStagedIdsChange(next);
  }, [stagedIds, selectionCap, onStagedIdsChange]);

  const handleFocusParticipant = useCallback((participant) => {
    setFocusedParticipant(participant);
    setMobileDetailOpen(true);
  }, []);

  const handleCreateExpert = () => {
    onCreateExpert?.();
  };

  const handleAutoSelectFive = useCallback(() => {
    const pool = tabLists.all || [];
    const pickCount = Math.min(AUTO_PICK_COUNT, selectionCap, pool.length);
    if (pickCount === 0) return;
    onStagedIdsChange(pickRandomParticipantIds(pool, pickCount));
    setActiveTab('all');
    setFocusedParticipant(null);
    setMobileDetailOpen(false);
    onAutoPick?.();
  }, [tabLists, selectionCap, onStagedIdsChange, onAutoPick]);

  const canAutoSelect = (tabLists.all || []).length > 0 && selectionCap > 0;

  const focusedColorIndex = useMemo(() => {
    if (!focusedParticipant) return 0;
    const idx = (tabLists.all || []).findIndex(
      (p) => p.participant_id === focusedParticipant.participant_id,
    );
    return idx >= 0 ? idx : 0;
  }, [focusedParticipant, tabLists]);

  const extraCount = (tabLists.extra || []).length;
  const emptyMessages = {
    core: extraCount > 0
      ? 'No core assistants loaded (HANA unavailable). Try the Extra Personas tab.'
      : 'Neon personas unavailable — check HANA auth.',
    extra: 'No extra personas in the catalog.',
    all: 'No personas available.',
  };

  return (
    <div
      className={
        'participant-directory'
        + (embedded ? ' participant-directory--embedded' : '')
      }
    >
      <div className="participant-directory-search-wrap">
        <Search size={16} className="participant-directory-search-icon" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          className="participant-directory-search"
          placeholder="Search personas…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search personas"
        />
      </div>

      {autoSelectMode && (
        <div className="participant-directory-banner" role="status">
          Auto-select is on — confirming a manual selection will turn it off.
        </div>
      )}

      <div
        className={
          'participant-directory-body'
          + (mobileDetailOpen ? ' participant-directory-body--detail-open' : '')
        }
      >
        <div className="participant-directory-main">
          <div className="participant-directory-tabs" role="tablist" aria-label="Persona categories">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={
                  'participant-directory-tab'
                  + (activeTab === tab.id ? ' participant-directory-tab--active' : '')
                }
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {(tabLists[tab.id] || []).length > 0 && (
                  <span className="participant-directory-tab-count">
                    {(tabLists[tab.id] || []).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="participant-directory-grid-wrap">
            {filteredList.length === 0 && activeTab !== 'all' && (
              <div className="participant-directory-empty">{emptyMessages[activeTab]}</div>
            )}
            {filteredList.length === 0 && activeTab === 'all' && !search.trim() && (
              <div className="participant-directory-empty">{emptyMessages.all}</div>
            )}
            {filteredList.length === 0 && search.trim() && (
              <div className="participant-directory-empty">No personas match your search.</div>
            )}
            <div className="participant-directory-grid">
              {filteredList.map((p, i) => (
                <ParticipantDirectoryCard
                  key={p.participant_id}
                  participant={p}
                  colorIndex={i}
                  selected={stagedSet.has(p.participant_id)}
                  focused={focusedParticipant?.participant_id === p.participant_id}
                  disabled={atCap}
                  onFocus={handleFocusParticipant}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
              {activeTab === 'all' && onCreateExpert && (
                <button
                  type="button"
                  className="participant-directory-create-card"
                  onClick={handleCreateExpert}
                >
                  <Plus size={22} strokeWidth={2} aria-hidden />
                  <span>Create Expert Persona…</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <ParticipantDetailPane
          participant={focusedParticipant}
          colorIndex={focusedColorIndex}
          modelAssignments={modelAssignments}
          allModelsFlat={allModelsFlat}
          showBack={isMobileLayout && mobileDetailOpen}
          onBack={() => setMobileDetailOpen(false)}
        />
      </div>

      {(embedded || showAutoPick) && (
        <div className="participant-directory-inline-summary">
          <span>
            {stagedIds.length} of {selectionCap} selected
            {stagedIds.length < 2 && embedded ? ' — select at least 2' : ''}
          </span>
          {showAutoPick && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleAutoSelectFive}
              disabled={!canAutoSelect}
              title="Randomly pick up to 5 participants from the catalog"
            >
              Select 5 automatically
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { AUTO_PICK_COUNT, pickRandomParticipantIds };
