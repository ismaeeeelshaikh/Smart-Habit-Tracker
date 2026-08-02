# Implementation Plan
## AI-Powered Personal Time Intelligence Platform — Phased Build Plan

**Companion to:** PRD, Implementation Spec & Sprint Backlog, TRD, UX Flow Document, UI/UX Design Brief, Backend Schema Document
**Author:** Senior Full-Stack Engineer & Project Manager (draft)
**Purpose:** Sequence the build so each phase produces a working, demoable deliverable, dependencies are respected (e.g., no UI before schema, no integrations before core CRUD works), and nothing from Phase 2+ scope leaks into MVP.

**How to read this:** Each phase lists **Goal**, **Tasks**, **Source of truth** (which earlier document has the authoritative detail — don't duplicate, reference), **Deliverable** (what must demonstrably work at phase end), and **Exit criteria** (the specific, testable condition that means the phase is actually done, not just "code written").

---

## Phase 0: Setup

**Goal:** A running, empty skeleton that all future phases build into — no business logic yet.

**Tasks:**
1. Initialize repo with the exact folder structure from Implementation Spec Section 2 (`frontend/`, `backend/`, `telegram/`, `scheduler/`, `voice/` [stub only], `mcp-server/` [stub only], `plugins/`, `docs/`, `docker/`)
2. Set up `docker-compose.yml` with 4 services: `backend`, `telegram`, `scheduler`, `db` (per TRD Section 1.3) — containers should start and stay up, even with no real functionality yet
3. Initialize FastAPI app skeleton with a `/health` endpoint (per TRD Section 10)
4. Initialize React + Vite + Tailwind frontend skeleton with a placeholder landing route
5. Set up PostgreSQL container with a persistent volume
6. Create `.env.example` covering every secret/config referenced across the TRD and Backend Schema Document (DB credentials, JWT signing key, Telegram bot token)
7. Set up Alembic for migrations, empty initial migration
8. Set up GitHub Actions CI: lint + placeholder test job (per TRD Section 8.3)
9. Copy all prior planning documents into `docs/`

**Source of truth:** Implementation Spec Section 2 (folder structure), TRD Sections 1.3 & 8 (topology, CI/CD)

**Deliverable:** `docker-compose up` brings up all 4 containers cleanly; `/health` returns 200; frontend loads a blank placeholder page; CI runs (even if there's nothing to test yet).

**Exit criteria:** A fresh clone of the repo, with `.env` filled from `.env.example`, boots successfully with one command, on a machine that has never seen this project before.

---

## Phase 1: Database

**Goal:** The full schema exists, migrated, and verified — before any endpoint depends on it.

**Tasks:**
1. Implement every table from the Backend Schema Document Section 2 as SQLAlchemy models: `users`, `schedule_blocks`, `goals`, `reminders`, `completion_logs`, `refresh_tokens`, `telegram_link_codes`
2. Generate and review Alembic migrations for all tables, including enums (`day_of_week_enum`, `priority_enum`, `reminder_status_enum`, `recurrence_rule_enum`, `completion_action_enum`) and `CHECK` constraints
3. Implement all indexes listed in Backend Schema Document Section 7
4. Write a seed script (dev-only, not run in production) that creates one test user with sample schedule/goals, for manual testing in later phases
5. Verify foreign key cascade/set-null behavior with a manual test (delete a goal, confirm linked reminders' `goal_id` becomes NULL and `label` is preserved)

**Source of truth:** Backend Schema Document Sections 2, 3, 7 (full DDL, relationships, indexes) — implement exactly as specified, do not modify field names/types.

**Deliverable:** `alembic upgrade head` produces the complete schema from a clean database; seed script populates one working test account.

**Exit criteria:** All tables, enums, constraints, and indexes exist and match the Backend Schema Document exactly; a manual `\d+ <table>` inspection in `psql` confirms structure for at least `users`, `reminders`, and `refresh_tokens`.

---

## Phase 2: Authentication

**Goal:** A user can sign up, log in, stay logged in across a session, and every subsequent phase can rely on a working, secure identity layer.

**Tasks:**
1. Implement `POST /auth/signup` — bcrypt hashing, email uniqueness check (case-insensitive), returns access token + sets refresh token cookie
2. Implement `POST /auth/login` — credential check, same token issuance as signup
3. Implement `POST /auth/refresh` — validates refresh token by hash, rotates it, detects reuse (per Backend Schema Document Section 4.3), issues new access token
4. Implement `POST /auth/logout` — revokes current refresh token, clears cookie
5. Implement the `get_current_user` FastAPI dependency (per Backend Schema Document Section 5.2) — used by every protected route from this point forward
6. Implement rate limiting on `/auth/login` and `/auth/signup` (per TRD Section 9)
7. Build frontend Signup and Login screens per UX Flow Document Sections 2–3, styled per UI/UX Design Brief Sections 3–5 (forms, buttons, error states)
8. Implement auth guard on the frontend (redirect to `/login` if no valid session, per UX Flow Document Section 11)

**Source of truth:** Backend Schema Document Section 4 (token flow detail), TRD Section 5 (auth stack decisions), UX Flow Document Sections 2–3 (exact screen behavior/error states)

**Deliverable:** A user can sign up, get redirected appropriately, log out, log back in, and remain authenticated across a page refresh (via silent refresh).

**Exit criteria:** Manual test covers: signup → auto-login → refresh page (session persists) → logout → attempt to access a protected route (redirected to login) → login again → refresh-token rotation confirmed via DB inspection (old token `revoked_at` set, new row exists).

---

## Phase 3: Core UI Shell

**Goal:** The application's navigation, layout, and visual system exist and are reusable — before building feature-specific screens on top of them.

**Tasks:**
1. Implement the global authenticated layout: top nav (desktop) / bottom tab bar (mobile), per UX Flow Document Section 1 and UI/UX Design Brief Section 6
2. Implement the design token system (CSS variables / Tailwind theme extension) exactly per UI/UX Design Brief Section 2 (colors) and Section 3 (typography) — this must exist before any feature screen is styled, not retrofitted later
3. Build shared components used across multiple screens: buttons (primary/secondary/destructive), form fields (with focus/error states), toasts, inline confirmation pattern, priority badge, empty-state pattern — per UI/UX Design Brief Section 5
4. Build the **Week Strip** component (per UI/UX Design Brief Section 4.2) as a standalone, reusable component with props for size/density — build it against mock data first, since real schedule data doesn't exist until Phase 4
5. Implement routing for all MVP routes (per UX Flow Document Section 1), each initially rendering an empty placeholder

**Source of truth:** UI/UX Design Brief (all sections), UX Flow Document Section 1 (site map) and Section 11 (global behaviors)

**Deliverable:** Every MVP route is reachable via navigation, styled consistently, with the Week Strip rendering correctly against mock data on at least one screen.

**Exit criteria:** A design/QA pass confirms the token system matches the Design Brief's hex values and type scale exactly (spot-check with browser devtools), and the Week Strip correctly renders both committed and free segments from a hardcoded sample dataset.

---

## Phase 4: Main Features — Schedule & Goals

**Goal:** The two foundational data-entry flows work end-to-end: schedule and goals, including onboarding.

**Tasks:**
1. Implement backend CRUD: `GET/POST /schedule`, `PUT/DELETE /schedule/{id}` and `GET/POST /goals`, `PUT/DELETE /goals/{id}` — enforcing ownership per Backend Schema Document Section 5.1 (never trust a client-supplied `user_id`)
2. Build Onboarding Step 1 (Schedule) and Step 2 (Goals) per UX Flow Document Sections 4.1–4.2, including the Add Block / Add Goal sub-forms, validation, and empty/error states exactly as specified
3. Build the standalone Schedule (`/schedule`) and Goals (`/goals`) management screens per UX Flow Document Sections 6–7, reusing the same components built for onboarding
4. Wire the real Week Strip (built in Phase 3 against mock data) to real schedule data
5. Implement the onboarding gating logic: block "Continue" on zero goals (goals screen only, not schedule), track `onboarding_completed_at` on `users`

**Source of truth:** UX Flow Document Sections 4.1, 4.2, 6, 7 (exact field-by-field behavior); Backend Schema Document Section 2.2–2.3 (schedule_blocks, goals tables)

**Deliverable:** A new user can complete Steps 1–2 of onboarding, and later edit their schedule/goals from the standalone management screens, with all CRUD operations persisting correctly.

**Exit criteria:** Full manual walkthrough: add a fixed block, add a flexible block, edit a block, delete a block, add a goal with each priority level, deactivate a goal, delete a goal — each producing the exact success/error/empty state specified in the UX Flow Document.

---

## Phase 5: Main Features — Scheduling Engine & Reminders

**Goal:** The core product logic — free-slot detection, priority allocation, and reminder tracking — works correctly and deterministically.

**Tasks:**
1. Implement `slot_engine.py` — pure function, computes free slots from a user's `schedule_blocks` for a given week (per Implementation Spec Section 2, `backend/app/services/`)
2. Implement `allocator.py` — pure function, given a free slot and active goals, returns best-fit allocation by priority/duration (per Implementation Spec Section 4, item 5)
3. Write unit tests for both with fixed input/output fixtures — no randomness, fully deterministic, per Implementation Spec Sprint 2 guidance
4. Package `slot_engine.py`/`allocator.py` as a shared internal module importable by both `backend` and `scheduler` containers (per TRD Section 6.4) — do not duplicate this logic
5. Implement `GET /slots/free` and `GET /slots/next` endpoints
6. Implement `POST /reminders`, `GET /reminders`, `PUT /reminders/{id}/status` endpoints
7. Build the Reminders screen (`/reminders`) per UX Flow Document Section 8, including the manual "Add reminder" sub-form with recurrence presets (None/Daily/Weekdays — no NLP parsing)
8. Build Dashboard screen per UX Flow Document Section 5, wiring in real `/slots/free`, `/slots/next` data plus the Week Strip (today view)

**Source of truth:** Implementation Spec Sections 3–5 (schema, feature scope, endpoints); UX Flow Document Sections 5, 8

**Deliverable:** Given a user's real schedule and goals, the system correctly computes today's free slots and suggests a best-fit task allocation; reminders can be created manually and their status updated via the API.

**Exit criteria:** Unit test suite for `slot_engine`/`allocator` passes with fixture-based cases covering: fully booked day, fully free day, one flexible block, multiple free slots of varying sizes, more pending goal-minutes than available slot time.

---

## Phase 6: Integrations — Telegram Bot & Scheduler

**Goal:** The product's primary delivery channel — Telegram — works end-to-end, including the automated dispatch loop.

**Tasks:**
1. Implement `POST /telegram/link` (generates code, writes to `telegram_link_codes`) and the webhook receiver `POST /telegram/webhook`
2. Build Onboarding Step 3 (Telegram Link) per UX Flow Document Section 4.3, including polling for connection status and expiry handling
3. Implement Telegram command handlers: `/today`, `/schedule`, `/free`, `/next`, `/done`, `/skip`, `/add`, `/stats`, `/help` — exact behavior, empty states, and error handling per UX Flow Document Sections 12.2–12.9
4. Implement the unlinked-user check (Section 12.10) as the first gate in every command handler
5. Implement inline keyboard buttons (✅ Done / ⏳ Later / ❌ Skip) on proactive reminder messages, per UX Flow Document Section 12.1, including message-editing behavior after a button is tapped and the error-state retry behavior
6. Configure APScheduler with the PostgreSQL job store in the dedicated `scheduler` container (per TRD Section 3 and Section 6)
7. Implement the dispatch job: periodically check each user's upcoming free slots, call the shared allocator, send the proactive reminder message via the Telegram bot service
8. Build the Settings screen's Telegram section (link/disconnect) per UX Flow Document Section 10

**Source of truth:** UX Flow Document Section 12 (full bot conversation spec) and Section 4.3/10 (web-side linking UI); TRD Sections 3, 6 (scheduler architecture, webhook mode); Backend Schema Document Section 2.7 (telegram_link_codes)

**Deliverable:** A fully linked user receives an automatic, correctly-timed Telegram reminder for a real free slot, and can act on it via inline buttons, with the result reflected back in the web app's Reminders/Stats screens.

**Exit criteria:** This is the single most important end-to-end test in the whole build — matches the Implementation Spec's Definition of Done (Section 7): sign up → schedule → goals → link Telegram → receive a reminder at the correct time → tap Done → confirm `completion_logs` updated → confirm it reflects in `/stats`.

---

## Phase 7: Stats & Settings (Remaining MVP Surface)

**Goal:** Close out the remaining MVP screens not yet built.

**Tasks:**
1. Implement `GET /stats/weekly` — completion % by priority, most-skipped goal (raw numbers, no LLM narrative, per Implementation Spec Section 4 explicit exclusion)
2. Build Stats screen (`/stats`) per UX Flow Document Section 9, including week navigation and empty-per-week state
3. Implement password-change endpoint (flagged as a gap in the UX Flow Document Section 10 — add it to the API surface now) and wire the Settings screen's account section
4. Finish the Settings screen fully (per UX Flow Document Section 10): account section, Telegram disconnect, logout

**Source of truth:** UX Flow Document Sections 9–10; Implementation Spec Section 4 (explicit non-LLM constraint on stats)

**Deliverable:** All 11 MVP routes from the site map (UX Flow Document Section 1) are fully functional, not placeholders.

**Exit criteria:** Every route in the site map has been manually walked through against its full spec (success, error, and empty states) at least once.

---

## Phase 8: Testing

**Goal:** Confidence that the system behaves correctly and won't silently break for real users — before deployment, not after.

**Tasks:**
1. Backend unit tests: all service-layer functions (`slot_engine`, `allocator`, `stats`), auth flows (token issuance, rotation, reuse detection), ownership enforcement (attempt cross-user access, confirm 403/404)
2. Backend integration tests: full request/response cycle for every endpoint in the Implementation Spec's API list, including error cases (validation failures, not-found, unauthorized)
3. Frontend tests: component tests for shared components (Section 3 deliverables) and at least one full flow test (signup → onboarding → dashboard)
4. Telegram bot tests: mock webhook payloads for each command, confirm correct handler behavior including the unlinked-user gate
5. Scheduler tests: confirm no duplicate job firing under simulated multi-run conditions (this directly tests the TRD Section 6/Decision #3 rationale — don't skip this, it's the one architectural risk called out explicitly)
6. Manual QA pass against the full UX Flow Document — every success/error/empty state, screen by screen
7. Manual QA pass against the UI/UX Design Brief — visual/spacing/type spot-checks, mobile breakpoints (per Design Brief Section 6)
8. Security review checklist pass against TRD Section 9 (rate limiting active, CORS restricted, no raw SQL, secrets not committed, webhook secret validated)

**Source of truth:** All prior documents — this phase is where every earlier spec becomes a test case, not new design decisions.

**Deliverable:** Passing CI test suite; a completed manual QA checklist derived from the UX Flow Document and Design Brief; a completed security checklist derived from TRD Section 9.

**Exit criteria:** CI is green; no known cross-user data access issue exists; the scheduler duplicate-firing test explicitly passes.

---

## Phase 9: Deployment

**Goal:** The system runs reliably outside a developer's laptop.

**Tasks:**
1. Provision staging VPS, deploy via Docker Compose, configure reverse proxy (Nginx or Caddy, per TRD Section 11 open question — default to Caddy for automatic HTTPS unless the team has Nginx expertise) with HTTPS
2. Set Telegram bot to webhook mode against the staging URL (per TRD Section 8.2), verify webhook secret validation works
3. Run full manual QA pass (Phase 8, Section 6/7 items) against staging, not just local
4. Set up automated daily Postgres backups to object storage, retained 14 days minimum (per TRD Section 8.5) — required before any real user data touches this environment
5. Provision production VPS, repeat deployment steps, using separate secrets/bot token from staging
6. Configure CI/CD: automated build+push on merge to `main`, manual/tag-triggered production deploy (per TRD Section 8.3 — no auto-deploy to prod)
7. Set up basic uptime monitoring against `/health`

**Source of truth:** TRD Sections 8 (full deployment plan) and 11 (open questions to resolve before this phase, not during it)

**Deliverable:** A publicly reachable staging environment, followed by a production environment, both running the full stack with HTTPS, backups, and monitoring in place.

**Exit criteria:** The Phase 6 end-to-end test (sign up → real Telegram reminder → Done → stats reflects it) passes against the **production** URL, not just localhost.

---

## Phase 10: Final Polish

**Goal:** Close remaining gaps between "functionally complete" and "ready for real users," without scope-creeping into Phase 2 features.

**Tasks:**
1. Accessibility pass: keyboard focus visibility, 44px tap targets, color-plus-label on priority badges (per UI/UX Design Brief Section 9) — verify, don't assume it was done correctly during feature phases
2. Copy pass: review all UI text, error messages, empty states, and Telegram bot messages against the tone principles in UI/UX Design Brief Section 7 and UX Flow Document's writing guidance — non-punitive language, active voice, consistent terminology
3. Performance check: confirm API response times meet TRD Section 10 targets (<300ms CRUD, <1s slot computation) under a basic load test
4. Cross-browser/cross-device spot check (desktop Chrome/Safari/Firefox, mobile Safari/Chrome)
5. Final review of Section 13 (Explicit Non-Goals) in the UX Flow Document and Section 8 (Explicit Non-Goals) in the Backend Schema Document — confirm none of them were accidentally built, and none of them are silently broken by their absence (e.g., confirm the app degrades gracefully with no dark mode, no NLP parsing, etc. rather than erroring)
6. Write/update `docs/README.md` with setup instructions for new contributors (relevant since this is intended as an open-source project)
7. Tag a `v1.0.0` release

**Source of truth:** UI/UX Design Brief Section 7 (UX principles) and Section 9 (accessibility floor); UX Flow Document Section 13; Backend Schema Document Section 8

**Deliverable:** A tagged, documented v1.0.0 release, ready to onboard real users and open-source contributors.

**Exit criteria:** A person unfamiliar with the project can clone the repo, follow `docs/README.md`, and get a working local instance running without asking a question.

---

## Phase Dependency Summary

```
Phase 0 (Setup)
    ↓
Phase 1 (Database)
    ↓
Phase 2 (Auth) ──────────────┐
    ↓                        │
Phase 3 (Core UI Shell)      │ (auth required by all protected routes from here on)
    ↓                        │
Phase 4 (Schedule & Goals) ◀─┘
    ↓
Phase 5 (Slot Engine & Reminders)
    ↓
Phase 6 (Telegram & Scheduler)
    ↓
Phase 7 (Stats & Settings)
    ↓
Phase 8 (Testing) ──▶ Phase 9 (Deployment) ──▶ Phase 10 (Final Polish)
```

**Note on parallelization:** Phase 3 (Core UI Shell) can begin in parallel with Phase 2 (Auth) once Phase 1 is done, since the design token system and shared components don't depend on auth being finished — only the auth *screens* (Signup/Login) need Phase 2's backend work. A two-person team could split Phase 2 (backend) and Phase 3 (frontend shell) concurrently. Testing (Phase 8) should not be treated as a single end-of-project phase in practice — the task list in Phase 8 assumes unit/integration tests were written incrementally alongside Phases 1–7, with Phase 8 being the consolidation, gap-filling, and full-system pass, not the first time tests are written.

---

## What Is Explicitly Out of Scope for This Plan

Per every prior document's MVP boundary: voice input, MCP tool layer, LLM-generated weekly reflection, the "what should I do now" chat interface, Google Calendar sync, adaptive/learning-based recommendations, and gamification are **not phases in this plan**. They require a separate Phase 2 implementation plan, to be written once MVP (Phases 0–10 above) is live and validated against the PRD's success metrics (PRD Section 7).

---

*This plan sequences work; it does not redefine scope, schema, screens, or style — those remain governed by their respective source documents referenced in each phase. If any task here seems to require inventing a detail not covered by an earlier document, stop and flag it rather than improvising, per the same principle established in the Implementation Spec.*
