# Product Requirements Document
## AI-Powered Personal Time Intelligence Platform (Habit Tracker + Adaptive Scheduling Assistant)

**Version:** 1.0 (Draft)
**Owner:** [Product Manager Name]
**Status:** Draft for review
**Last updated:** August 2026

---

## 1. App Overview

The Personal Time Intelligence Platform is an AI-assisted habit and schedule companion that helps users build consistent habits by adapting to their real, ever-changing weekly schedule — instead of relying on fixed-time reminders.

Users input their recurring weekly commitments (college, work, gym, travel, family time) and their habit goals with priority levels. The system continuously computes free time slots, allocates habits into those slots based on priority and duration, and delivers contextual, conversational reminders through Telegram, with optional voice input for adding or rescheduling tasks on the fly.

Unlike traditional habit trackers that ask "did you do X today?" at a fixed hour regardless of context, this platform asks "you have 25 free minutes right now — here's what fits."

**One-line positioning:** A scheduling-aware habit assistant that tells you *when* to do something, not just reminds you that you haven't.

---

## 2. Problem Statement

Habit-tracking apps today (Habitica, Streaks, Loop, etc.) share a common structural flaw: they treat time as fixed. A reminder set for 7 PM assumes 7 PM is free every day. In reality, users — especially students and working professionals — have schedules that shift daily due to classes, meetings, travel, or family obligations.

This mismatch causes three consistent failure patterns:

1. **Missed reminders** — the notification fires during a commitment, gets dismissed, and is never revisited.
2. **Cognitive overhead** — users must manually check their own calendar before deciding whether a habit is even possible right now.
3. **Streak abandonment** — after a few missed days caused by schedule conflicts (not lack of motivation), users lose momentum and quit the app entirely.

The result is that habit apps end up tracking failure rather than enabling success. Users don't need to be reminded more often — they need to be reminded *at the right time*, based on what their day actually looks like.

---

## 3. Target Users

### Primary persona: "The Scheduled Student"
- College/university students with class-heavy, semester-variable timetables.
- Wants to build habits (learning a skill, exercise, reading) around a schedule that changes by day and by week.
- Currently uses generic reminder apps or none at all; abandons streak-based apps within 2–3 weeks.

### Secondary persona: "The Busy Early-Career Professional"
- Full-time employees with recurring meetings, commute time, and unpredictable overtime.
- Wants habits (learning React, meditating, reading) fit into genuine gaps rather than a rigid 6 AM routine that doesn't survive a busy week.

### Tertiary persona: "The Self-Improvement Builder"
- Power users and early open-source adopters (likely first community around this project) who want a highly customizable, self-hostable system and are comfortable with Telegram bots and voice commands.

**Out of scope for v1:** enterprise/team habit tracking, children's use cases, users without a smartphone/Telegram access.

---

## 4. Core Features

### 4.1 Weekly Schedule Builder
Users input recurring weekly commitments (day, activity, time block). Supports fixed blocks (College 9–5), free-form days (Saturday: Mostly Free), and loosely defined blocks (Sunday: Family).

### 4.2 Goal & Priority Management
Users define habit goals (Learn React, Exercise, Meditation, Read, Drink Water) and assign priority (High/Medium/Low) and estimated duration per session.

### 4.3 Free Slot Detection Engine
Rule-based algorithm computes available time windows from the weekly schedule, updated whenever the schedule changes. No LLM required for this layer.

### 4.4 Priority-Based Task Allocation
Given a free slot and pending habits, the system allocates tasks by priority and best-fit duration (e.g., 30-min slot → 20-min React + 10-min Meditation). Deterministic, rule-based.

### 4.5 Telegram Bot — Contextual Reminders
Sends time-aware, conversational nudges ("You have a free 25-minute slot before your gym. Suggested: React Revision — 20 min.") with inline action buttons: ✅ Done, ⏳ Later, ❌ Skip.

### 4.6 Telegram Commands
`/today`, `/schedule`, `/free`, `/next`, `/done`, `/skip`, `/add`, `/delete`, `/stats`, `/help`.

### 4.7 Voice-to-Task via LLM + MCP
Users send a voice note ("Tomorrow remind me to revise DBMS at 8 PM" / "Every weekday remind me to drink water every 2 hours"). Whisper transcribes → LLM extracts structured intent → MCP tool call creates/updates the reminder in the database → Scheduler → Telegram delivery.

### 4.8 Chat Interface — "What should I do now?"
Conversational query that checks current time, schedule, and pending tasks, and replies with a ranked micro-plan for the available window.

### 4.9 Weekly Reflection (LLM-generated)
End-of-week summary: completion rate by priority tier, most-skipped habit, and a plain-language inferred reason pattern (e.g., "Most skipped: Reading. Common reason: late college hours.").

### 4.10 MCP Tool Layer
Exposes controlled tools the LLM can invoke rather than editing the database directly: create task, update schedule, delete reminder, mark complete, fetch today's agenda. (Sync calendar reserved for a later phase.)

---

## 5. User Stories

**Onboarding**
- As a new user, I want to enter my weekly schedule day-by-day so the system knows when I'm busy vs. free.
- As a new user, I want to list my habit goals and set a priority for each so the system knows what matters most to me.

**Daily use**
- As a student, I want to receive a Telegram message when I have a free slot so I don't have to manually check my calendar to decide what to do.
- As a user, I want to mark a suggested task as Done, Later, or Skip directly from Telegram so tracking takes one tap.
- As a user, I want to ask "what should I do now?" and get a suggestion based on my actual free time.

**Voice / natural input**
- As a user, I want to say "remind me to revise DBMS tomorrow at 8 PM" and have it automatically scheduled without opening the app.
- As a user, I want to set a recurring reminder ("every weekday, drink water every 2 hours") using natural language.

**Reflection & control**
- As a user, I want a weekly summary of how consistent I was with high-priority habits so I can adjust my goals.
- As a user, I want to see and edit my upcoming schedule and reminders at any time via `/schedule`.

**Power user / open-source contributor**
- As a contributor, I want a clearly separated MCP tool layer so I can add new tools (e.g., calendar sync) without touching core scheduling logic.

---

## 6. MVP Scope (Version 1)

**Included:**
- Account creation and manual weekly schedule entry (text/form-based)
- Goal creation with priority (High/Medium/Low) and estimated duration
- Rule-based free-slot detection engine
- Rule-based priority allocation (no LLM)
- Telegram bot: contextual reminders with Done/Later/Skip buttons
- Core Telegram commands: `/today`, `/schedule`, `/free`, `/next`, `/done`, `/skip`, `/add`, `/stats`, `/help`
- Basic recurring reminders (daily/weekday patterns) created manually (no voice yet)
- Simple weekly stats (completion % by priority) — can start as computed stats before adding LLM narrative

**Explicitly deferred to post-MVP (Phase 2):**
- Voice input (Whisper + LLM intent parsing)
- MCP tool layer and natural-language reminder creation
- LLM-generated weekly reflection narrative
- Chat interface ("what should I do now?")
- Adaptive/learning recommendation engine (shifting suggested times based on historical completion)

**Deferred to Phase 3+:**
- Google Calendar sync
- Web frontend polish (React/Tailwind dashboard) beyond a minimal setup UI
- Multi-device / team habit tracking

**Rationale:** The MVP proves the core hypothesis — that context-aware, slot-based reminders improve consistency versus fixed-time reminders — using the cheapest, most reliable technology (rule-based logic + Telegram). LLM and voice features are high-novelty but not required to validate the core value proposition, and add real infra/cost/complexity risk if bundled into v1.

---

## 7. Success Metrics

**Activation**
- % of signed-up users who complete schedule + goal setup within 24 hours (target: >60%)

**Engagement**
- Average Telegram reminder response rate (Done/Later/Skip vs. ignored) (target: >70% interaction rate)
- Daily active users / weekly active users ratio (stickiness)

**Core value validation**
- Habit completion rate for High-priority tasks (target: >75%, benchmarked against user's own pre-app estimate)
- Week-over-week retention (target: >40% still active at week 4 — the point where most habit apps see steep drop-off)

**Product health**
- Reminder relevance: % of reminders marked "Skip" due to bad timing vs. genuine disinterest (tracked via lightweight follow-up prompt) — target to minimize timing-related skips
- Schedule edit frequency (proxy for whether static weekly input is too rigid — high edit frequency signals need for calendar sync sooner)

**Qualitative**
- User-reported reduction in "I forgot" as a reason for missed habits (survey-based, at 30-day mark)

---

## 8. Features to Avoid in Version 1

- **Full Google Calendar / multi-calendar sync** — adds OAuth complexity and edge cases (overlapping events, timezones) before the core loop is validated.
- **Adaptive/ML-based time-of-day learning** — valuable but premature; needs weeks of completion data to be meaningful, and risks producing bad early suggestions from a cold start.
- **Gamification (streaks, badges, leaderboards)** — easy to bolt on later; building it into v1 risks the app becoming another abandoned streak tracker rather than proving the scheduling hypothesis.
- **Team/shared habit tracking or social features** — out of scope for the individual-productivity core use case.
- **Free-text, fully unstructured schedule entry with NLP parsing** — start with structured/semi-structured input (day + activity + time range); NLP schedule parsing is a v2+ enhancement once the data model is proven.
- **Multi-platform notification support (WhatsApp, email, push)** — Telegram only for v1 to keep the bot integration surface small.
- **Custom LLM fine-tuning or self-hosted model training** — use off-the-shelf Llama 3 / OpenAI-compatible APIs; no need to train anything for v1 feature set.
- **Complex habit dependency logic** (e.g., "only suggest Meditation if Exercise was completed") — interesting but adds rule-engine complexity disproportionate to MVP value.

---

## 9. Open Questions for Review

1. Should Phase 2 prioritize voice/MCP or Google Calendar sync first, given schedule-entry friction is likely the biggest early drop-off point?
2. What's the minimum viable onboarding flow — should schedule entry be a form, a chat-based wizard, or both?
3. Self-hosted (open source, Docker Compose) vs. hosted SaaS for early users — does v1 target technical early adopters only, or a broader non-technical audience from day one?
4. What's the fallback behavior when Telegram delivery fails or a user hasn't opened the bot in X days — re-engagement flow needed?

---

*This PRD is a living document. Sections 6–8 (scope, metrics, exclusions) should be revisited after MVP user testing.*
