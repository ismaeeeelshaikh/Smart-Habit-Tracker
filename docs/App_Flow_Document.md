# UX Flow Document
## AI-Powered Personal Time Intelligence Platform — Complete Screen & Interaction Spec (MVP)

**Companion to:** PRD, Implementation Spec & Sprint Backlog, Technical Requirements Document
**Author:** UX Strategist (draft)
**Scope:** MVP only — matches Implementation Spec Section 4 (Must Build). No Phase 2 screens (voice, chat interface, calendar sync) are included.

---

## 0. How to Use This Document

Each screen below is specified with:
- **Purpose** — what the screen is for
- **Entry points** — how the user gets here
- **Elements** — every visible component
- **Actions** — every clickable/interactive element and its exact behavior
- **Success state** — what happens on successful completion
- **Error states** — every failure case and what the user sees
- **Empty state** — what shows when there's no data yet
- **Navigation** — where each action leads

If a behavior isn't specified here, the agent should treat it as **not in scope for MVP** rather than inferring one.

---

## 1. Site Map (MVP)

```
/signup
/login
/onboarding/schedule        (first-time setup, step 1)
/onboarding/goals           (first-time setup, step 2)
/onboarding/telegram-link   (first-time setup, step 3)
/dashboard                  (home after onboarding / login)
/schedule                   (view/edit schedule)
/goals                      (view/edit goals)
/reminders                  (view reminder history/status)
/stats                      (weekly stats view)
/settings                   (account + Telegram link management)
```

**Global nav (visible on all authenticated pages):** Dashboard | Schedule | Goals | Reminders | Stats | Settings | Logout

---

## 2. Screen: Signup (`/signup`)

**Purpose:** Create a new account.

**Entry points:** Direct link, "Sign up" link from Login page, first visit to root URL if unauthenticated.

**Elements:**
- App logo/name
- Email input field
- Password input field
- Confirm password input field
- "Sign Up" button (primary)
- "Already have an account? Log in" link (secondary)

**Actions:**
| Element | Behavior |
|---|---|
| Email field | Validates format on blur (basic regex). Shows inline error if invalid. |
| Password field | Validates min 8 characters, at least 1 number, on blur. Shows inline error if invalid. |
| Confirm password field | Validates match with password field on blur/submit. |
| "Sign Up" button | Disabled until all fields pass client-side validation. On click: calls `POST /auth/signup`. Shows loading spinner on button during request. |
| "Already have an account?" link | Navigates to `/login` |

**Success state:** Account created → JWT tokens issued → auto-redirect to `/onboarding/schedule` (first-time users always start onboarding, never land directly on dashboard).

**Error states:**
| Case | Display |
|---|---|
| Email already registered (API 409) | Inline error under email field: "An account with this email already exists. [Log in instead]" (link to `/login`) |
| Weak password (API 422) | Inline error under password field with the specific rule violated |
| Network/server error (5xx) | Toast/banner at top: "Something went wrong. Please try again." Form remains filled in (no data loss). |
| Passwords don't match | Inline error under confirm-password field, blocks submit |

**Empty state:** N/A (form screen, no data list)

---

## 3. Screen: Login (`/login`)

**Purpose:** Authenticate an existing user.

**Entry points:** Direct link, "Log in" link from Signup, redirect after logout, redirect when an unauthenticated user hits any protected route.

**Elements:**
- App logo/name
- Email input field
- Password input field
- "Log In" button (primary)
- "Forgot password?" link
- "Don't have an account? Sign up" link

**Actions:**
| Element | Behavior |
|---|---|
| "Log In" button | On click: `POST /auth/login`. Loading spinner during request. |
| "Forgot password?" link | **Out of scope for MVP** — link should be hidden or disabled with tooltip "Coming soon" rather than leading to a broken flow. Agent should not build a password-reset flow unless separately instructed. |
| "Don't have an account?" link | Navigates to `/signup` |

**Success state:** Tokens issued → redirect based on onboarding status: if user has never completed onboarding (no schedule blocks + no goals saved), redirect to `/onboarding/schedule`; otherwise redirect to `/dashboard`.

**Error states:**
| Case | Display |
|---|---|
| Invalid credentials (API 401) | Inline error below form: "Incorrect email or password." (Do not specify which field is wrong — standard security practice.) |
| Account locked/rate-limited (API 429) | Banner: "Too many attempts. Please try again in a few minutes." |
| Network/server error | Toast/banner: "Something went wrong. Please try again." |

**Empty state:** N/A

---

## 4. Onboarding Flow (First-Time Setup)

Onboarding is a **linear 3-step wizard**. Users cannot skip ahead, but can go back. Progress indicator (e.g., "Step 1 of 3") shown at top on all onboarding screens.

### 4.1 Onboarding Step 1: Schedule Setup (`/onboarding/schedule`)

**Purpose:** Capture the user's recurring weekly commitments.

**Entry points:** Immediately after signup; from login redirect if onboarding incomplete; "Back" from Step 2.

**Elements:**
- Step indicator: "Step 1 of 3: Your Weekly Schedule"
- 7 day sections (Mon–Sun), each collapsible/expandable, each containing:
  - "Add block" button
  - List of added blocks for that day (label, time range or "Flexible" tag, edit/delete icons)
- "Skip for now" link (small, secondary — allows an empty schedule, see rationale below)
- "Continue" button (primary, bottom of page)

**Add Block sub-form (opens as modal or inline expansion):**
- Label input (free text, e.g., "College", "Gym") — required
- Toggle: "Fixed time" vs "Flexible / no fixed time"
  - If Fixed: Start time picker + End time picker (both required)
  - If Flexible: no time fields shown
- "Save block" button
- "Cancel" button

**Actions:**
| Element | Behavior |
|---|---|
| "Add block" (per day) | Opens Add Block sub-form for that day |
| "Save block" | Validates: label non-empty; if Fixed, end time must be after start time. On valid: `POST /schedule`, adds block to that day's list, closes sub-form. |
| Edit icon on a block | Opens Add Block sub-form pre-filled, saves via `PUT /schedule/{id}` |
| Delete icon on a block | Confirmation inline ("Remove this block?" Yes/No) → `DELETE /schedule/{id}` on confirm |
| "Skip for now" | Navigates to Step 2 without requiring any blocks. Rationale: a fully free week (e.g., a user on break) is valid; forcing dummy input would be worse UX than allowing an empty schedule. |
| "Continue" | Navigates to `/onboarding/goals`. No minimum number of blocks required. |

**Success state:** Each block save shows a brief inline confirmation (e.g., green checkmark flash on the new list item). No full-page success state until wizard completion (Step 3).

**Error states:**
| Case | Display |
|---|---|
| Save block fails validation (client-side) | Inline red text under the invalid field, submit blocked |
| Save block fails on server (API error) | Inline error message inside the sub-form: "Couldn't save this block. Please try again." Sub-form stays open with entered data intact. |
| Delete fails | Toast: "Couldn't remove this block. Please try again." Item remains in list. |

**Empty state:** Each day with no blocks shows placeholder text: "No commitments added for [Day]. Add one or leave it free." — not an error, a neutral prompt.

### 4.2 Onboarding Step 2: Goal Setup (`/onboarding/goals`)

**Purpose:** Capture habit goals with priority and duration.

**Entry points:** "Continue" from Step 1; "Back" from Step 3.

**Elements:**
- Step indicator: "Step 2 of 3: Your Goals"
- "Add goal" button
- List of added goals (name, priority badge, duration, edit/delete icons)
- "Back" button (secondary, bottom left) → returns to Step 1, retaining entered data
- "Continue" button (primary, bottom right)

**Add Goal sub-form:**
- Name input (free text, e.g., "Learn React") — required
- Priority selector (High / Medium / Low) — required, no default pre-selected (forces intentional choice)
- Estimated duration input (minutes, numeric) — required, must be > 0
- "Save goal" / "Cancel" buttons

**Actions:**
| Element | Behavior |
|---|---|
| "Add goal" | Opens Add Goal sub-form |
| "Save goal" | Validates all required fields. On valid: `POST /goals`, adds to list, closes sub-form. |
| Edit/Delete icons | Same pattern as schedule blocks (Section 4.1) — edit opens pre-filled form (`PUT /goals/{id}`), delete has inline confirm (`DELETE /goals/{id}`) |
| "Continue" | **Blocked if zero goals added.** Shows inline message: "Add at least one goal to continue — this is how the app knows what to suggest." Unlike schedule (which can be empty), goals cannot be empty since the entire product has no function without at least one goal. |

**Success state:** Goal added → appears in list with priority badge color-coded (High = red/orange, Medium = yellow, Low = green — consistent across the whole app).

**Error states:** Same pattern as Section 4.1 (inline validation, server-error toast/inline message, delete failure toast).

**Empty state:** "No goals yet. Add your first goal to get started." shown when list is empty — paired with the disabled/blocked "Continue" button described above.

### 4.3 Onboarding Step 3: Telegram Link (`/onboarding/telegram-link`)

**Purpose:** Connect the user's Telegram account so reminders can be delivered.

**Entry points:** "Continue" from Step 2.

**Elements:**
- Step indicator: "Step 3 of 3: Connect Telegram"
- Explanatory text: "Reminders are delivered via Telegram. Connect your account to get started."
- "Generate linking code" button
- Once generated: displayed code (large, monospace, copyable) + instructions: "Open Telegram, message @[BotUsername], and send this code."
- Live status indicator: "Waiting for connection..." (polling) → "Connected ✅" once linked
- "Finish setup" button (disabled until connected)
- "Skip for now" link (secondary — allows finishing onboarding without Telegram, see below)

**Actions:**
| Element | Behavior |
|---|---|
| "Generate linking code" | Calls `POST /telegram/link`, displays returned code, starts polling `GET /telegram/link/status` (or equivalent) every 3–5 seconds |
| Status polling | On detecting `telegram_chat_id` is now set for the user, updates status to "Connected ✅", enables "Finish setup" button |
| "Finish setup" | Marks onboarding complete, redirects to `/dashboard` |
| "Skip for now" | Marks onboarding complete without Telegram linked, redirects to `/dashboard`. Rationale: don't hard-block a user from exploring the app if they want to link Telegram later — but the dashboard must clearly prompt them to do so (see Section 5). |

**Success state:** "Connected ✅" shown, confirmation toast: "Telegram connected! You'll start receiving reminders."

**Error states:**
| Case | Display |
|---|---|
| Code expired (>10 min unused) | Status area shows: "This code expired. [Generate a new code]" |
| Code generation fails (server error) | Inline error: "Couldn't generate a code. Please try again." |
| Polling timeout (e.g., no connection after 10 min) | Non-blocking message: "Still waiting — you can finish setup and connect Telegram later from Settings." "Skip for now" remains available. |

**Empty state:** Before "Generate linking code" is clicked, only the explanatory text and button are shown — no code area rendered yet.

---

## 5. Screen: Dashboard (`/dashboard`)

**Purpose:** Home screen after login/onboarding — at-a-glance view of today.

**Entry points:** Post-onboarding redirect, post-login redirect (if onboarding complete), global nav "Dashboard" link, logo click.

**Elements:**
- Greeting header: "Hi, [user's name/email prefix] 👋"
- **Telegram connection banner** (only shown if `telegram_chat_id` is null): "You haven't connected Telegram yet — reminders won't be delivered. [Connect now]" (links to `/settings`)
- "Today's Free Slots" card: list of computed free slots for today (from `GET /slots/free`, filtered to today)
- "Next Suggested Task" card: shows output of `GET /slots/next` — task name, duration, target time
- "This Week at a Glance" mini-stats: completion % (from `GET /stats/weekly`), shown as a simple number/small bar, not a full chart
- Quick links: "View Schedule" / "View Goals" / "View Full Stats"

**Actions:**
| Element | Behavior |
|---|---|
| "Connect now" (banner) | Navigates to `/settings` |
| "View Schedule" / "View Goals" / "View Full Stats" | Navigate to respective pages |
| Free slot list items | Static display only in MVP — not clickable/actionable from dashboard (actioning happens via Telegram) |

**Success state:** All cards populate with real data.

**Error states:**
| Case | Display |
|---|---|
| `/slots/free` or `/slots/next` fails to load | Card shows: "Couldn't load your schedule right now." with a "Retry" button (re-fetches on click) |
| `/stats/weekly` fails to load | Mini-stats area shows: "Stats unavailable." with "Retry" |

**Empty states:**
| Condition | Display |
|---|---|
| No free slots today (fully booked day) | "Today" Free Slots" card shows: "No free time today — enjoy your full schedule!" (neutral, not framed as a problem) |
| No goals exist (shouldn't happen post-onboarding, but handle defensively) | "Next Suggested Task" card shows: "Add a goal to get personalized suggestions." with link to `/goals` |
| No stats yet (first week, no completions logged) | Mini-stats area shows: "Not enough data yet — check back after your first few reminders." |

---

## 6. Screen: Schedule (`/schedule`)

**Purpose:** View and manage the full weekly schedule after onboarding.

**Entry points:** Global nav "Schedule" link, "View Schedule" from Dashboard.

**Elements:** Same 7-day block list UI as Onboarding Step 1 (Section 4.1), reused as a component, plus a persistent "Add block" per day — no wizard framing, no "Continue"/"Skip" buttons since this is post-onboarding management, not setup.

**Actions:** Identical CRUD behavior to Section 4.1 (Add/Edit/Delete blocks), minus the onboarding-specific navigation.

**Success/Error/Empty states:** Identical to Section 4.1, except the empty state per day reads: "No commitments on [Day]." (Same neutral tone, no onboarding framing.)

---

## 7. Screen: Goals (`/goals`)

**Purpose:** View and manage active goals after onboarding.

**Entry points:** Global nav "Goals" link, "View Goals" from Dashboard.

**Elements:** Same goal list UI as Onboarding Step 2 (Section 4.2), reused as a component, with an added **"Deactivate" toggle** per goal (in addition to Edit/Delete) — deactivating sets `is_active = false` via `PUT /goals/{id}` without deleting history tied to it.

**Actions:**
| Element | Behavior |
|---|---|
| Add/Edit/Delete | Same as Section 4.2 |
| "Deactivate" toggle | Confirmation inline: "Pause this goal? It won't be suggested until reactivated." → `PUT /goals/{id}` with `is_active: false`. Toggle re-enables it. |

**Note:** Unlike onboarding, this screen does not block on zero active goals — but if the user deactivates/deletes their last goal, show a persistent banner: "You have no active goals — you won't receive any suggestions. [Add a goal]"

**Success/Error states:** Same pattern as Section 4.2.

**Empty state:** "You haven't added any goals yet. [Add your first goal]" (if list is fully empty, distinct from "all deactivated" banner above).

---

## 8. Screen: Reminders (`/reminders`)

**Purpose:** View history and status of reminders (read-only in MVP web app — actioning Done/Later/Skip happens via Telegram, not here).

**Entry points:** Global nav "Reminders" link.

**Elements:**
- Filter controls: status dropdown (All / Pending / Done / Later / Skipped), date range (default: this week)
- List/table of reminders: task name, scheduled time, status badge, recurring indicator icon (if applicable)
- "Add manual reminder" button (maps to `/add` Telegram command equivalent on web)

**Add manual reminder sub-form:**
- Task/goal selector (dropdown of active goals, or free-text label for a one-off)
- Date + time picker
- Recurrence selector: None / Daily / Weekdays (simple presets only — no custom cron in MVP UI)
- "Save" / "Cancel"

**Actions:**
| Element | Behavior |
|---|---|
| Filter dropdown/date range | Re-fetches `GET /reminders` with query params, updates list |
| "Add manual reminder" | Opens sub-form |
| "Save" (sub-form) | Validates date/time is in the future for non-recurring; `POST /reminders`; adds to list; closes form |
| Status badges | Display only — not clickable in MVP web UI (explicitly deferred: web-based Done/Later/Skip actions are a Phase 2 nicety, Telegram is the actioning channel for MVP per PRD) |

**Success state:** New reminder appears in list immediately after save, sorted into correct position by time.

**Error states:**
| Case | Display |
|---|---|
| Save fails validation | Inline error under relevant field |
| Save fails on server | Inline error in sub-form: "Couldn't create reminder. Please try again." |
| List fails to load | Table area shows: "Couldn't load reminders." with "Retry" button |

**Empty state:** "No reminders match this filter." when filtered list is empty (distinguish from true zero-state: "You don't have any reminders yet." when totally empty, no filters applied).

---

## 9. Screen: Stats (`/stats`)

**Purpose:** Weekly completion statistics (raw numbers, no LLM narrative in MVP — matches Implementation Spec explicitly).

**Entry points:** Global nav "Stats" link, "View Full Stats" from Dashboard.

**Elements:**
- Week selector (default: current week, can navigate to previous weeks if data exists)
- Completion rate by priority: 3 simple stat blocks (High / Medium / Low) each showing "X% completed (Y of Z)"
- "Most skipped goal" stat: name + skip count
- Simple bar or progress-style visual per priority tier (basic chart component, no LLM-generated commentary text)

**Actions:**
| Element | Behavior |
|---|---|
| Week selector (prev/next arrows) | Re-fetches `GET /stats/weekly` for selected week |

**Success state:** Stats render for the selected week.

**Error states:** Load failure shows: "Couldn't load stats for this week." with "Retry" button.

**Empty state:** If selected week has no completion data: "No activity recorded for this week." (distinct per week, not a blanket empty state — user should be able to navigate to a week that does have data).

---

## 10. Screen: Settings (`/settings`)

**Purpose:** Account management and Telegram link management post-onboarding.

**Entry points:** Global nav "Settings" link, "Connect now" banner from Dashboard.

**Elements:**
- Account section: email (read-only display), "Change password" button
- Telegram section:
  - If linked: "Connected as [Telegram username or chat ID] ✅" + "Disconnect" button
  - If not linked: Same "Generate linking code" flow as Onboarding Step 3 (Section 4.3), reused as a component
- "Log out" button

**Actions:**
| Element | Behavior |
|---|---|
| "Change password" | Opens sub-form: current password, new password, confirm new password → on submit, calls password-change endpoint (not detailed elsewhere in this doc set — flag as a required addition to the API spec if not already present) |
| "Disconnect" (Telegram) | Confirmation inline: "Disconnect Telegram? You won't receive reminders until you reconnect." → on confirm, clears `telegram_chat_id` |
| "Generate linking code" | Same behavior as Section 4.3 |
| "Log out" | Clears tokens, redirects to `/login` |

**Success states:**
- Password changed: toast "Password updated."
- Telegram disconnected: toast "Telegram disconnected."
- Telegram connected: toast "Telegram connected!"

**Error states:**
| Case | Display |
|---|---|
| Current password incorrect | Inline error under current-password field: "Incorrect password." |
| New password fails validation | Inline error, same rules as Signup |
| Disconnect/connect API failure | Toast: "Something went wrong. Please try again." |

**Empty state:** N/A (account settings always has data by definition of being logged in)

---

## 11. Global Behaviors (Apply to All Screens)

| Behavior | Spec |
|---|---|
| Auth guard | Any protected route accessed without a valid access token redirects to `/login`. If refresh token is valid, silently refresh and retry instead of forcing re-login. |
| Session expiry | If refresh also fails (expired/invalid), redirect to `/login` with a banner: "Your session expired. Please log in again." |
| Loading states | Every async action (button click triggering an API call) shows a loading indicator on that specific element (spinner in button, skeleton loader for lists) — never a blank screen with no feedback. |
| Network offline | If a request fails due to no connectivity, show a generic toast: "You're offline. Check your connection and try again." distinct from server-error messaging. |
| Confirmation pattern | All destructive actions (delete block, delete goal, disconnect Telegram) use inline confirmation (expand to Yes/No), not a separate modal dialog — keeps interaction lightweight and consistent. |
| 404 / unknown route | Simple "Page not found" screen with a link back to `/dashboard` (or `/login` if unauthenticated). |
| Priority color coding | Consistent across all screens: High = red/orange, Medium = yellow/amber, Low = green. Defined once as a shared style token, not per-component. |

---

## 12. Telegram Bot Flow (Addendum — Not a Web Screen, but Core UX)

Included because reminders and the Done/Later/Skip actioning loop happen here, not in the web app, and an agent building "the full UX" needs this specified too.

### 12.1 Reminder message (proactive, sent by scheduler)

**Trigger:** Scheduler dispatch job determines a free slot + suggested task.

**Message format:**
```
Hi [Name] 👋

You have a free [X]-minute slot before [next commitment, if known].

Suggested task: [Task Name]
Estimated time: [X] minutes

Start now?
```
**Buttons (inline keyboard):** ✅ Done | ⏳ Later | ❌ Skip

**Button behaviors:**
| Button | Behavior |
|---|---|
| ✅ Done | Calls `PUT /reminders/{id}/status` with `done`. Bot edits the original message to append: "✅ Marked as done — nice work!" Buttons removed after action (prevent double-tap). |
| ⏳ Later | Calls same endpoint with `later`. Bot edits message to append: "⏳ Snoozed — I'll check in again later." Buttons removed. **Behavior:** re-surfaces this task in the next detected free slot within the same day, or next day if none remain. |
| ❌ Skip | Calls same endpoint with `skipped`. Bot edits message to append: "❌ Skipped. No worries — see you next time." Buttons removed. |
| No response (timeout) | If unanswered by end of the suggested time window, reminder status remains `pending`; no auto-skip in MVP (avoid punishing users for not being glued to Telegram — this is a deliberate scope decision, not an omission). |

**Error state:** If the status update API call fails when a button is tapped, bot edits message to show: "⚠️ Couldn't save that — please try again." and re-shows the buttons (does not silently fail).

### 12.2 Command: `/today`

**Behavior:** Calls equivalent of `GET /reminders?date=today` + `GET /slots/free`. Replies with a formatted list of today's schedule blocks and free slots.
**Empty state:** "You have no scheduled commitments today — fully free!" if no schedule blocks; "No free slots left today." if fully booked.

### 12.3 Command: `/schedule`

**Behavior:** Replies with the full week's schedule blocks, grouped by day, formatted as text.
**Empty state:** "You haven't added a schedule yet. Add one at [web app link]/schedule."

### 12.4 Command: `/free`

**Behavior:** Replies with today's remaining free slots only (subset of `/today`).
**Empty state:** "No free time left today."

### 12.5 Command: `/next`

**Behavior:** Calls `GET /slots/next`, replies with the next suggested task in the same format as the proactive reminder message (Section 12.1), including action buttons.
**Empty state:** "No upcoming free slots found in your schedule." (e.g., if schedule is fully booked for the visible window)

### 12.6 Command: `/done`, `/skip`

**Behavior:** If used without context (not replying to a specific reminder message), bot replies asking for clarification: "Which task? Reply to a reminder message, or use /next to see your current suggestion." Does not guess which reminder is meant — avoids silently marking the wrong task.

### 12.7 Command: `/add`

**Behavior:** Bot asks a short sequence of questions (task name → date → time → recurrence: none/daily/weekdays) via plain text prompts (no NLP parsing in MVP — structured step-by-step, matching the "no LLM in MVP" constraint). On completion, calls `POST /reminders`, confirms: "✅ Reminder set: [Task] on [Date] at [Time]."
**Error state:** Invalid date/time format at any step → bot replies: "I didn't understand that. Please try again in [expected format]." and re-asks the same step (does not restart the whole flow).
**Cancel:** User can send `/cancel` at any point in the multi-step flow to abort.

### 12.8 Command: `/stats`

**Behavior:** Calls `GET /stats/weekly`, replies with the same raw numbers as the web Stats screen (Section 9), formatted as text — no LLM narrative.
**Empty state:** "No activity recorded yet this week."

### 12.9 Command: `/help`

**Behavior:** Static text listing all available commands with one-line descriptions. No API call.

### 12.10 Unlinked user interaction

**Behavior:** If a message/command arrives from a Telegram chat ID not linked to any user account, bot replies: "This Telegram account isn't linked yet. Go to [web app]/settings to connect it." — every command handler must check this first before processing.

---

## 13. Explicit Non-Goals for This UX Spec (Do Not Build)

- No mobile-native app screens (web-responsive only)
- No dark mode toggle (deferred — can be added as a pure CSS enhancement later without spec changes)
- No in-app notification bell (all notifications are Telegram-only per MVP scope)
- No drag-and-drop schedule editing (form-based CRUD only)
- No Done/Later/Skip actioning from the web Reminders screen (Telegram-only for MVP, noted in Section 8)
- No onboarding progress save-and-resume across devices beyond normal auth persistence (i.e., no special "resume onboarding via email link" flow)

---

*This document should be read alongside the Implementation Spec (data model, endpoints) and TRD (auth/session behavior). Any UI requirement here that implies an API endpoint not already listed in the Implementation Spec (e.g., password change, Telegram link status polling) should be flagged back to that document before implementation, not invented ad hoc.*
