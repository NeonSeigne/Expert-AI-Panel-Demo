# Co-Panel — Complete Feature Inventory

Use this checklist when migrating the UI. It covers every user-facing capability in the frontend and the backend behaviors the new UI must still wire up to.

**App type:** Single-page app, no client-side router. One main screen + overlays/modals.

---

## 1. App shell & layout

- [ ] **Header bar** — Co-Panel logo + title (logo links to https://www.neon.ai/)
- [ ] **Participant sidebar** (left) — active roster with enable/disable, expand details, remove
- [ ] **Main chat column** (right) — question controls + conversation feed
- [ ] **Footer** — copyright + link to https://www.neon.ai/contact (Patents and licensing)
- [ ] **Global modals layer** — all overlays mounted at app root (not per-route)

---

## 2. Header actions

| Control | Location | Notes |
|---------|----------|-------|
| Participants dropdown | Header | See §3 |
| Add a Human Participant | Header (desktop) | Shows participant name when configured |
| Table View | Header (desktop) | Disabled until chat has messages |
| More actions (⋯) | Header (mobile ≤600px) | Human participant + Table View only |
| Settings (gear) | Header | See §5 |
| Downloads | Header | See §6 |
| Auth badge | Header | See §12 |

---

## 3. Participant management

### 3.1 Participants dropdown

- [ ] **Select N Automatically** toggle (auto-select mode)
  - When ON: manual checkboxes disabled; orchestrator picks at chat start
  - When OFF: restores prior manual selection snapshot
  - Label shows `Participants Auto Selected` vs `Participants (n/max)`
- [ ] **Create Expert Persona…** (top of list + bottom of Expert section)
- [ ] **Neon Personas** section — checkbox list from `/api/personas` (neon)
  - Empty state: *"Neon personas unavailable - check HANA auth."*
- [ ] **Extra Personas** section — 7 bundled demo personas (checkbox list)
- [ ] **Expert Personas** section — user-created personas (checkbox list)
  - Empty state: *"You haven't created any expert personas yet."*
- [ ] Participant cap enforced (3–9 max, human counts as one slot)
- [ ] Checkbox items disabled when auto-select ON or cap reached
- [ ] Mobile bottom-sheet + backdrop dismiss (≤600px)

### 3.2 Bundled extra personas (default trio on first load)

| ID | Display name |
|----|--------------|
| `extra_elena_financial_strategist` | Elena — Financial Strategist |
| `extra_marcus_technology_strategist` | Marcus — Technology Strategist |
| `extra_amira_security_advisor` | Dr. Amira — Security & Privacy Advisor |

*(Plus 4 other extras in catalog: Pragmatic Finance Expert, Skeptical Philosopher, Empathetic Historian, Data-Driven Geologist.)*

### 3.3 Participant sidebar

- [ ] **Enable toggle** (on/off slider) — off ≠ removed; participant stays in roster
- [ ] **Remove** button when disabled — actually drops from conversation
- [ ] **Re-enable** button on disabled cards
- [ ] **Accordion expand** — LLM model + persona prompt (280-char preview + Show full/less)
- [ ] Human participant card — green styling, "Human" tag, role description (no LLM)
- [ ] Human always listed **first** in sidebar
- [ ] Empty/help states:
  - Auto-select on: *"Auto-select is on."* + explanation card
  - No participants: *"Use the Participants dropdown…"*

### 3.4 Expert persona builder (modal)

- [ ] **Create** and **Edit** custom expert personas
- [ ] **Delete** existing expert persona
- [ ] Tabs: **Structured** | **Freeform**
- [ ] Structured fields: name, profile, identity, writing samples
- [ ] Freeform: large text area + **file upload** for writing samples
- [ ] **Role style** toggle: `AI-completed` vs `Exact` (matches LLMChats3 semantics)
- [ ] **Generate role prompt** from fields (calls backend)
- [ ] **Suggest model** — orchestrator recommends LLM with rationale; Accept/Dismiss
- [ ] Per-persona **model picker** (from full model list)
- [ ] Save persists to localStorage; appears in Expert section + sidebar when selected

### 3.5 Human participant (modal + in-chat)

- [ ] **Add / Edit** via header button (desktop) or More menu (mobile)
- [ ] Fields: **name**, **profile text** (freeform background)
- [ ] **Approve** saves spec; backend generates credential summary in background
- [ ] **Remove** clears human from session
- [ ] Credential regenerated if **question changes** before chat start
- [ ] Max **1 human** per session; occupies one participant slot
- [ ] During chat: **human turn** input slot when orchestrator pauses for human
- [ ] **Submit** response (Ctrl+Enter) or **Skip my turn**
- [ ] **Human turn indicator** — fixed bottom cue; click scrolls to input slot
- [ ] Mid-chat **credential edit** via Credential Summary modal (human row only)

---

## 4. Chat controls & question input

- [ ] **Question text field** — demo mode vs custom mode
- [ ] **Demo questions** — 12 server-provided prompts; cycles after each Start
- [ ] Demo display format: `Demo Question: {title} [Or type your own question]`
- [ ] Typing switches from demo → custom mode; clearing restores demo
- [ ] **Start Chat** button (Play icon) — disabled with tooltip when <2 enabled participants
- [ ] **Enter** key submits when start enabled
- [ ] **Stop Chat** — in the live dock status bar (not top controls) while running
- [ ] **Start new chat** — after end-of-chat summary / download bar (not top controls) when idle with content
- [ ] **Active question** display while chat is running
- [ ] Loading placeholder: *"Loading demo questions…"*
- [ ] Disabled reason text in input placeholder when start blocked

---

## 5. Settings menu (gear / DevMenu)

### 5.1 Theme

- [ ] **Light / Dark** toggle (Sun/Moon)
- [ ] Applied via `data-theme` on `<html>`
- [ ] **Persisted** to localStorage

### 5.2 Model selection (accordion)

- [ ] **Orchestrator model** — searchable sub-panel picker
- [ ] **Summarizer model** — searchable sub-panel; "Same as Orchestrator" option
- [ ] **Create Expert Persona…** shortcut
- [ ] **Per-participant model override** — one row per active participant
- [ ] Sub-panel: search filter, provider grouping, "Default (backend)" option
- [ ] Orchestrator model synced to backend via `PUT /api/chat/orchestrator`
- [ ] Orchestrator + summarizer + assignments **persisted** to localStorage

### 5.3 Max participants

- [ ] Stepper **3–9** (− / value / +)
- [ ] Truncates selection if lowered below current count
- [ ] **Persisted** to localStorage

### 5.4 Conversation format (accordion)

- [ ] **Discussion structure** — radio list from server catalog
  - `collaborative` (default) — Collaborative Discussion
  - `roberts_rules` — Robert's Rules of Order
- [ ] **Decision method** — radio list from server catalog
  - `consensus` (default) — Consensus
  - `majority` — Majority Rules Voting
  - `ranked_choice` — Ranked Choice Voting
  - `roberts_rules_vote` — Robert's Rules Vote
- [ ] Catalog fetched from `/api/chat/conversation-formats` (plugin-extensible)
- [ ] Selections **persisted** to localStorage (null = server default)

### 5.5 Response priority (accordion)

- [ ] **Prioritize model choice** (default) — each participant uses assigned model
- [ ] **Prioritize conversation speed** — model racing, parallel turns, substitution chain
- [ ] Synced to backend via `PUT /api/chat/speed-priority` (not localStorage)

### 5.6 Display options (accordion)

- [ ] **Show response times** on participant message bubbles (elapsed seconds)
- [ ] **Show chat stats** after "End of Chat" (message count + total time)
- [ ] Session-only (not persisted)

### 5.7 View prompts (accordion)

- [ ] **View Credential Summary…** — opens modal (disabled until session exists)
- [ ] **View current chat prompts…** — opens prompt catalog modal (lazy-loaded)

### 5.8 Advanced

- [ ] **Conversation limits…** — opens limits modal; shows "(custom)" when overrides exist

---

## 6. Downloads menu

### View

- [ ] **Summary table…** — opens table modal (disabled until chat has messages)

### Downloads

- [ ] **Chat as .txt**
- [ ] **Chat as .md**
- [ ] **Summary table as .csv**
- [ ] **Full API history** (.json) — disabled until session exists

*(Same four chat exports duplicated in post-chat download bar — see §8.)*

---

## 7. Chat area & conversation UI

### 7.1 Empty state (before first chat)

- [ ] Lead copy: panel of AI experts debating toward a considered answer
- [ ] Instruction varies: ready (demo trio) vs need ≥2 participants
- [ ] **Static sample preview** panel (`aria-hidden`) — fake orchestrator + 3 demo bubbles
- [ ] Sample uses default trio names/IDs from storage constants

### 7.2 Live conversation feed

- [ ] **MD3 chat surfaces** — entire transcript column scoped under `NeonDesignRoot` with Material Web tokens (`--md-sys-color-*`)
- [ ] **Participant message bubbles** — MD3 surface-container / primary-container message shapes (not Neon speech bubbles); persona tint as left accent + avatar
- [ ] **Human / question bubble** — primary-container MD3 shape
- [ ] Avatar initial, speaker name (label medium), optional elapsed time
- [ ] **Addressee arrow chip** — click scrolls to addressee's prior message + flash highlight
- [ ] **"Replying to" pill** when orchestrator assigned open threads
- [ ] **Direct-reply indent** + thread line when replying to immediately previous bubble
- [ ] **Streaming tokens** — messages can arrive via `message_stream_start` / `message_delta`
- [ ] **Collapsible round sections** — MD3 expansion panels; report rounds open by default
- [ ] **Live active round** — while running, current phase RoundSection grows in the bottom live dock with full (uncollapsed) bubbles
- [ ] **Collapsed avatar stack** — stacked speaker initials with notification badges for reply counts per persona
- [ ] **Bubble dropdowns** — clamped MD3 bubbles; `md-icon-button` chevron expands full markdown (skipped while round is live)
- [ ] **Orchestrator messages** — outlined / primary-container MD3 cards with kind icons; enter animation; report pulse
- [ ] **Live ballot card** — for `ballot_options` and vote `motion` messages: option rows; persona chips animate onto the chosen option (or #1 for ranked-choice; Aye/Nay/Abstain for yes/no) as `vote_cast` arrives; marks complete on `vote_tally`
- [ ] **Standalone Vote panel** — non-collapsible surface outside round accordions; live ballot evolves into the structured VoteBoard result (no separate end-of-chat vote summary); consensus still uses Decision summary panel
- [ ] **Inline system notes** — errors, auto-select rationale, vote cast/tally (fallback only when no live ballot card), model substitution, participant replacement, participant errors
- [ ] **Live round dock** — active phase at bottom; when phase advances, round folds into a collapsed accordion section in the transcript
- [ ] **Status bar** — `md-linear-progress` indeterminate + SSE status text; secondary line for phase / speakers; Stop Chat on the right
- [ ] **Human input slot** — green border, context from asker, Submit / Skip, Ctrl+Enter hint
- [ ] **Failsafe pause banner** — Continue button with +20 messages or +50 orchestrator calls label
- [ ] **"End of Chat"** system message styling

### 7.3 Post-chat UI

- [ ] **Chat stats line** (optional): participant message count + total generation time
- [ ] **Decision summary panel** — consensus alliance board below End of Chat / stats (vote results use the standalone Vote panel instead):
  - **Consensus alliance board**: stance clusters with member opinions; majority group highlighted when a majority report was produced
  - Fed by `decision` on `GET /api/chat/{id}/table` (full `session.final_report`)
- [ ] **Persona reliability strip** — MD3 card; credibility via `md-linear-progress`; status via `md-assist-chip`; consecutive failures
- [ ] **Download bar** below stats — `md-outlined-button` row mirroring header Download menu:
  - Summary table view
  - Chat as .txt / .md
  - Summary table as .csv
  - Full API log
- [ ] **"Talk to Co-Panel" CTA** — links to https://www.neon.ai/contact
- [ ] **Start new chat** button centered below the summary / download bar
- [ ] Download bar stacks vertically on narrow viewports (≤480px)

---

## 8. Modals & overlays

| Modal | Opened from | Must support |
|-------|-------------|--------------|
| **ExpertPersonaModal** | Dropdown, Settings | Create/edit/delete expert; structured + freeform; role gen; model suggest |
| **HumanParticipantModal** | Header, More menu | Name + profile; Approve / Cancel / Remove |
| **CredentialSummaryModal** | Settings | Per-participant credentials; Refresh; Download .txt; edit human fields inline |
| **ConversationLimitsModal** | Settings → Advanced | Server schema-driven fields; steppers; Reset all / per-field reset |
| **PromptCatalogModal** | Settings | Grouped templates; Copy; Download .txt |
| **ChatTableView** | Table View, downloads | Question, final report, participant table (credibility, failures, status, opinions); Export CSV |
| **RateLimitNotice** | Auto / on blocked start | "One chat left" or "Daily limit reached" + OK |

**Dismiss patterns:** × close, overlay click (varies by modal), backdrop click (rate limit)

---

## 9. Credential summary (modal + backend)

- [ ] Built automatically during Phase 1 (initial opinions) for each LLM participant
- [ ] Refreshed after final critique round
- [ ] Human credential always **first** in list
- [ ] Per entry: name, expertise, personality, credibility (0–1), bias to watch
- [ ] **Refresh** re-fetches from server
- [ ] **Download .txt** export from modal header
- [ ] Human row **inline edit**: name, expertise, personality, credibility, bias
- [ ] Empty state: *"No Credential Summary has been generated yet…"*
- [ ] SSE `credentials_updated` caches data for instant modal open

---

## 10. Conversation limits modal (Advanced settings)

Server-driven schema from `/api/chat/limits/defaults`. User overrides sent sparse on chat start; server clamps.

### Discussion structure

| Field | Default | Range | Purpose |
|-------|---------|-------|---------|
| `critique_rounds` | 2 | 1–4 | Phase 2 turns per participant |
| `status_assessment_max` | 3 | 0–5 | Follow-up iterations (0 = skip phase) |
| `consensus_turns_per_participant` | 6 | 2–12 | Phase 5 budget × active count |
| `dyad_cap` | 2 | 1–5 | Max consecutive addressed-to replies |
| `stall_recovery_attempts` | 1 | 0–3 | Extra consensus attempts after stall |

### Reliability

| Field | Default | Range | Purpose |
|-------|---------|-------|---------|
| `auto_disable_failures` | 3 | 1–10 | Consecutive LLM failures before auto-disable |

### Failsafes

| Field | Default | Range | Purpose |
|-------|---------|-------|---------|
| `participant_message_pause_at` | 60 | 10–500 | First pause after N participant messages |
| `participant_message_pause_inc` | 20 | 5–100 | Extra messages per Continue |
| `orchestrator_call_pause_at` | 100 | 20–500 | First pause after N orchestrator calls |
| `orchestrator_call_pause_inc` | 50 | 10–200 | Extra orchestrator calls per Continue |

- [ ] Overrides **persisted** to localStorage
- [ ] Reset all clears overrides (server defaults apply)

---

## 11. Prompt catalog (transparency modal)

- [ ] Lazy-loaded from `/api/chat/prompts/catalog`
- [ ] Grouped by conversation phase
- [ ] Each item: title, purpose, variables list, full template text
- [ ] **Copy** button per template (clipboard)
- [ ] **Download .txt** of full catalog from modal header
- [ ] Empty/loading: *"Loading prompts…"*

---

## 12. Table view (summary modal)

- [ ] Session question at top
- [ ] Final group opinion / report
- [ ] Per-participant columns:
  - Name, model display
  - Credibility (0–1 bar)
  - Consecutive failures
  - Status (Active / Auto-disabled / Off)
  - First opinion (Phase 1)
  - Conversation contribution (LLM summary)
  - Revised opinion (Phase 4)
  - Final opinion (consensus/finalization)
- [ ] **Export CSV** button (same as download menu CSV; includes failure/enabled/auto-disabled columns at end)
- [ ] Empty cells: *"(no summary)"* ; no final report yet message
- [ ] Full viewport on mobile (≤600px)

---

## 13. Auth & rate limiting

- [ ] **Sign in** → HuggingFace OAuth (`/oauth/huggingface/login`)
- [ ] **Sign out** → `/oauth/huggingface/logout`
- [ ] Logged-in display: username + optional **org** tag (org members unlimited)
- [ ] **Daily cap**: 30 conversations/IP for non-org users (configurable server-side)
- [ ] **Rate limit notice modal**:
  - Auto popup once per session when 1 chat remains
  - Popup when starting chat after limit exhausted
  - Contact: mailto:info@neon.ai
- [ ] Auth badge **hidden entirely** on ≤480px (auth still works via direct URL)

---

## 14. Chat lifecycle (backend behaviors UI must handle)

### 14.1 Start chat

- [ ] Validates ≥2 **enabled** participants (or auto-select with ≥2 candidates)
- [ ] POST `/api/chat/start` → **SSE stream**
- [ ] Auto-select: ranks candidates, updates sidebar selection, shows rationale system message
- [ ] Human credential generation if pending or question changed
- [ ] Rate limit check before start

### 14.2 SSE events the UI handles

| Event | UI response |
|-------|-------------|
| `session` | Store session ID + roster |
| `status` | Update status bar text |
| `message` | Append/update participant message |
| `message_stream_start` / `message_delta` | Streaming bubble |
| `orchestrator` | Orchestrator banner or status |
| `credentials_updated` | Cache for credential modal |
| `failsafe_pause` | Show pause banner (messages cap) |
| `orchestrator_cap_pause` | Show pause banner (orchestrator cap) |
| `human_turn_needed` | Show input slot + bottom indicator |
| `human_turn_cleared` | Hide input slot |
| `participant_error` | Inline system note |
| `participant_substituted` | Inline system note (speed priority) |
| `participant_replaced` | Inline system note + roster update |
| `vote_cast` / `vote_tally` | Live ballot card chips / complete; fallback system notes if no ballot card; tallies also in end-of-chat Decision summary |
| `system` | System message ("End of Chat" clears status) |
| `error` | Error system message |
| `done` | Mark chat not running |

### 14.3 Pause & continue

- [ ] **Continue conversation** → POST `/api/chat/{id}/continue?reason=messages|orchestrator`
- [ ] Two failsafe types with different increment labels on button

### 14.4 Stop

- [ ] AbortController cancels SSE fetch
- [ ] System message: *"Chat stopped by user."*

### 14.5 Human response

- [ ] POST `/api/chat/{id}/human-response` with text or skip flag

---

## 15. Conversation engine (what happens behind the UI)

### 15.1 Collaborative structure phases

1. Initial opinions
2. Critique rounds (1–4 configurable)
3. Status assessment (0–5 iterations)
4. Finalization
5. Consensus / voting (depends on decision method)
6. Closure (majority report, no-consensus, vote results, etc.)

### 15.2 Robert's Rules structure

- Opening → initial remarks → motion + second → debate → move the question → vote

### 15.3 Decision methods (UI selects; backend executes)

- **Consensus** — alliance-aware deliberation → majority or no-consensus report; end-of-chat **ConsensusAllianceBoard** shows stance groups + member opinions
- **Majority** — single-choice or aye/nay vote; end-of-chat **VoteBoard** shows ballots, reasons, tally
- **Ranked choice** — instant-runoff IRV; **VoteBoard** shows rankings + IRV rounds
- **Robert's Rules vote** — formal aye/nay/abstain on motion; **VoteBoard** with RR flavor label

### 15.4 Deliberation features (message-surfaced; alliances also on Decision summary)

- Addressed-to routing between participants
- Pending thread tracking
- Alliance detection (also rendered on end-of-chat consensus board)
- Stall recovery with unaddressed-factor probe
- Dyad cap (prevents two-voice monopolization)
- Thinking traces stripped from all displayed text

---

## 16. Export & download formats

| Action | Format | API | Available when |
|--------|--------|-----|----------------|
| Chat export | `.txt` | `GET /export?fmt=txt` | Chat has messages |
| Chat export | `.md` | `GET /export?fmt=md` | Chat has messages |
| Summary table | `.csv` | `GET /export?fmt=csv-table` | Chat has messages |
| API call log | `.json` | `GET /api-log` | Session exists |
| Credential summary | `.txt` | Client-side from modal data | Session + credentials exist |
| Prompt catalog | `.txt` | Client-side from catalog data | Catalog loaded |

Exports return `{ filename, content }` JSON; frontend triggers browser download.

---

## 17. Model & persona catalog (data the UI loads)

### On mount (useSettings / useParticipants)

- [ ] `GET /api/models` — providers + Neon HANA models/personas
- [ ] `GET /api/personas` — neon + extra participant catalog
- [ ] `GET /api/demo-questions` — 12 starter questions
- [ ] `GET /api/chat/orchestrator` — default orchestrator model
- [ ] `GET /api/chat/speed-priority` — speed priority flag
- [ ] `GET /api/chat/conversation-formats` — structures + decisions
- [ ] `GET /api/auth/status` — login state, org, remaining chats
- [ ] `GET /api/rate-limit/status` — daily limit info

### Lazy-loaded

- [ ] `GET /api/chat/limits/defaults` — on first Conversation Limits open
- [ ] `GET /api/chat/prompts/catalog` — on first Prompt Catalog open
- [ ] `GET /api/chat/{id}/credentials` — on Credential Summary open (also SSE-cached)
- [ ] `GET /api/chat/{id}/table` — on Table View open / end-of-chat reliability + decision summary; returns `rows`, `final_report` text, `final_report_kind`, and structured `decision` (= full `session.final_report`: ballots, tally/irv, alliance_groups, etc.)

### Pre-chat API helpers (called from modals)

- [ ] `POST /api/chat/generate-role` — structured expert role
- [ ] `POST /api/chat/generate-role-freeform` — freeform expert role
- [ ] `POST /api/chat/suggest-model` — expert model recommendation
- [ ] `POST /api/chat/auto-select-participants` — auto-select at start
- [ ] `POST /api/chat/credentials/from-profile` — human credential from profile text

---

## 18. localStorage persistence

**Namespace:** `ccai-vibe-demo` (schema version 1)

| Key | What |
|-----|------|
| `expert_personas` | User-created expert persona specs |
| `participants_selected` | Array of selected participant IDs |
| `participants_enabled` | Map of participant_id → boolean |
| `model_assignments` | Map of participant_id → model_id override |
| `orchestrator_model_id` | Orchestrator model pick |
| `summarizer_model_id` | Summarizer model pick |
| `max_participants` | 3–9 cap |
| `theme` | `light` or `dark` |
| `conversation_limits` | Sparse override map |
| `auto_select_mode` | Boolean |
| `human_participant` | Full human spec + credential summary |
| `conversation_structure_id` | Structure plugin ID (null = default) |
| `decision_method_id` | Decision plugin ID (null = default) |

**Chat history namespace:** `ccai-chat-history` (separate key)

- Array of up to 20 saved transcripts (newest first): question, messages, systemMessages, sessionParticipants, savedAt
- Written on End of Chat and before Start / Start new chat wipes the live transcript
- Sidebar **Previous chats** list (desktop) restores a transcript view-only; backend export/table need a live session
- Hidden in the ≤900px horizontal participant strip

**Not persisted in prefs:** live session ID, display toggles, modal open states, demo question index, speed priority (backend-owned).

---

## 19. Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| **≤900px** | Sidebar stacks above chat (max-height 200px); full-width sidebar |
| **≤600px** | Header wraps; desktop human/table buttons hidden; More menu shown; participant dropdown → bottom sheet; auth remaining count hidden |
| **≤480px** | Smaller logo/title/icons; sidebar 160px max; post-chat downloads stack full-width; auth badge hidden |

---

## 20. Theming & branding

- [ ] Light/dark themes via CSS variables on `[data-theme]`
- [ ] Co-Panel logo in header (`/neon-logo.png`; alt text Co-Panel)
- [ ] Indigo/purple accent gradient (LLMChats3 heritage)
- [ ] Per-participant bubble color palette (9 colors by roster index)
- [ ] Human participant always green
- [ ] Figtree font (Google Fonts)
- [ ] External links: neon.ai homepage, neon.ai/contact

---

## 21. Deployment & environment notes (affect UI behavior)

- [ ] **Local dev:** frontend `:3000`, backend `:8000` via `REACT_APP_API_URL`
- [ ] **Docker / HF Spaces:** single origin `:7860`, relative API URLs
- [ ] **Mock backend** (`mock_backend.py`): UI-only canned SSE for screenshots (not production)
- [ ] Sessions in-memory on server — lost on restart
- [ ] HuggingFace OAuth required for unlimited access in production
- [ ] Provider API keys gate which models appear in pickers (empty sections if key missing)

---

## 22. Feature hooks (current architecture — preserve behavior)

When rebuilding UI, these three hooks + context providers own all state:

| Hook | Owns |
|------|------|
| `useSettings` | Theme, models, orchestrator/summarizer, formats, limits, auth, rate limit, display toggles, prompt/limits modals |
| `useParticipants` | Catalog, selection, enable map, expert/human personas, auto-select, model assignments |
| `useChatSession` | Messages, SSE lifecycle, pause/continue, human turn, exports, table/credentials session data |

Leaf components consume hooks via context — no prop drilling through Header.

---

## 23. Quick migration checklist (minimum viable parity)

Use this shorter list for a first-pass UI rewrite:

1. [ ] Header with all 6 action areas (participants, human, table, settings, downloads, auth)
2. [ ] Participant dropdown with 3 catalog sections + auto-select + expert create
3. [ ] Sidebar with enable/remove/accordion
4. [ ] Question input + Start/Stop
5. [ ] Chat feed (bubbles, orchestrator, system notes, streaming)
6. [ ] Human turn input + indicator
7. [ ] Failsafe pause + Continue
8. [ ] Settings: theme, models, max participants, format, speed priority, display options
9. [ ] All 7 modals
10. [ ] All 4 download formats + post-chat bar
11. [ ] Rate limit notices
12. [ ] localStorage persistence (§18)
13. [ ] Responsive mobile menu + bottom sheet
14. [ ] Empty states (chat, sidebar, dropdowns, modals)
15. [ ] SSE event handling (§14.2)

---

*Generated from codebase audit. Backend routes live in `backend/app/`; frontend components in `frontend/src/components/`.*
