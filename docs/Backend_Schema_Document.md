# Backend Schema Document
## AI-Powered Personal Time Intelligence Platform

**Companion to:** PRD, Implementation Spec, TRD, UX Flow Document, UI/UX Design Brief
**Author:** Senior Backend Engineer (draft)
**Scope:** MVP only. Extends the Implementation Spec's Section 3 schema with full DDL, indexes, auth/session tables, and explicit ownership rules. This document supersedes the Implementation Spec's schema section where they differ — the additions here (timezone, refresh tokens, telegram link codes) are required fixes, not optional extras.

---

## 1. Entity Relationship Overview

```
users (1) ──< (many) schedule_blocks
users (1) ──< (many) goals
users (1) ──< (many) reminders
users (1) ──< (many) completion_logs
users (1) ──< (many) refresh_tokens
users (1) ──< (many) telegram_link_codes

goals (1) ──< (many) reminders          [reminders.goal_id nullable — manual reminders have no goal]
reminders (1) ──< (many) completion_logs [one reminder can have multiple status-change events over time]
```

**Ownership root:** every table except `users` itself has a direct, non-nullable `user_id` foreign key. There is no table in this schema that is reachable without a `user_id` path — this is intentional and is the basis of the permission model in Section 6.

---

## 2. Full DDL

### 2.1 `users`

```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    timezone            VARCHAR(64) NOT NULL DEFAULT 'UTC',   -- IANA tz name, e.g. 'Asia/Kolkata'
    telegram_chat_id    VARCHAR(64) UNIQUE,                    -- NULL until linked
    telegram_username   VARCHAR(255),                          -- display only, NULL until linked
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,         -- soft-disable, not used for deletion in MVP
    onboarding_completed_at TIMESTAMPTZ,                       -- NULL until onboarding wizard finished
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));
CREATE UNIQUE INDEX idx_users_telegram_chat_id ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
```

**Notes:**
- `timezone` is required (Section 4 of the TRD flagged this as a missing column in the earlier spec — it is now authoritative here). All schedule/slot computation reads this field; never assume UTC-as-local.
- Email uniqueness is enforced case-insensitively via the functional index, since `user@x.com` and `User@x.com` should collide.
- `telegram_chat_id` uniqueness prevents one Telegram account from being linked to two different app accounts.
- `onboarding_completed_at` (not a boolean) — storing the timestamp instead of a flag gives free analytics on onboarding funnel timing at no extra cost, and cleanly answers "has this user finished onboarding" via `IS NOT NULL`.

### 2.2 `schedule_blocks`

```sql
CREATE TYPE day_of_week_enum AS ENUM ('mon','tue','wed','thu','fri','sat','sun');

CREATE TABLE schedule_blocks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week         day_of_week_enum NOT NULL,
    label               VARCHAR(100) NOT NULL,
    start_time          TIME,                -- NULL if is_flexible_block = TRUE
    end_time            TIME,                -- NULL if is_flexible_block = TRUE
    is_flexible_block   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_fixed_block_has_times CHECK (
        (is_flexible_block = TRUE AND start_time IS NULL AND end_time IS NULL)
        OR
        (is_flexible_block = FALSE AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE INDEX idx_schedule_blocks_user_day ON schedule_blocks (user_id, day_of_week);
```

**Notes:**
- The `CHECK` constraint enforces at the DB level what the UX Flow Document specifies at the form level (fixed blocks require both times, end after start) — don't rely on application-layer validation alone for data integrity.
- `ON DELETE CASCADE`: deleting a user removes their schedule blocks. This is a deliberate MVP simplification (no soft-delete/GDPR export flow yet — flagged as a Phase 2+ concern in Section 8).
- Composite index on `(user_id, day_of_week)` because every read of the schedule is scoped to a user and typically filtered/grouped by day (matches `GET /schedule` and the Week Strip's per-day rendering).

### 2.3 `goals`

```sql
CREATE TYPE priority_enum AS ENUM ('high','medium','low');

CREATE TABLE goals (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                        VARCHAR(150) NOT NULL,
    priority                    priority_enum NOT NULL,
    estimated_duration_minutes  INTEGER NOT NULL CHECK (estimated_duration_minutes > 0),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_user_active ON goals (user_id, is_active);
```

**Notes:**
- Index on `(user_id, is_active)` because the allocator (`allocator.py`) always queries "this user's active goals" — the most frequent read pattern for this table.
- No `ON DELETE CASCADE` complexity beyond the standard user cascade; `is_active` (not row deletion) is the primary mechanism for "pausing" a goal per the UX Flow Document's Deactivate toggle — actual `DELETE /goals/{id}` still hard-deletes the row per the Implementation Spec, `is_active=false` is the softer alternative surfaced in the UI.

### 2.4 `reminders`

```sql
CREATE TYPE reminder_status_enum AS ENUM ('pending','done','later','skipped');
CREATE TYPE recurrence_rule_enum AS ENUM ('none','daily','weekdays');

CREATE TABLE reminders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id             UUID REFERENCES goals(id) ON DELETE SET NULL,   -- NULL = manual one-off reminder, or goal was deleted
    label               VARCHAR(150) NOT NULL,      -- denormalized copy of goal name (or manual entry) at creation time
    scheduled_time      TIMESTAMPTZ NOT NULL,
    status               reminder_status_enum NOT NULL DEFAULT 'pending',
    is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule     recurrence_rule_enum NOT NULL DEFAULT 'none',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_recurring_has_rule CHECK (
        (is_recurring = FALSE AND recurrence_rule = 'none')
        OR
        (is_recurring = TRUE AND recurrence_rule != 'none')
    )
);

CREATE INDEX idx_reminders_user_time ON reminders (user_id, scheduled_time);
CREATE INDEX idx_reminders_user_status ON reminders (user_id, status);
CREATE INDEX idx_reminders_goal ON reminders (goal_id) WHERE goal_id IS NOT NULL;
```

**Notes:**
- `label` is **denormalized** from `goals.name` deliberately: if a user renames or deletes a goal, past reminders should still display what they were actually reminded to do at the time, not silently change or break. This is a standard "snapshot at creation" pattern for historical records.
- `goal_id` uses `ON DELETE SET NULL` (not CASCADE) — deleting a goal must not delete the historical reminders/completion record tied to it; the `label` snapshot keeps that record meaningful even after `goal_id` goes null.
- Two separate indexes on `user_id` combined with `scheduled_time` and `status` because the scheduler job queries by time range, while the Reminders screen (`GET /reminders`) filters by status — both are frequent, differently-shaped queries, not served well by a single composite index.

### 2.5 `completion_logs`

```sql
CREATE TYPE completion_action_enum AS ENUM ('done','later','skipped');

CREATE TABLE completion_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id         UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action              completion_action_enum NOT NULL,
    "timestamp"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_completion_logs_user_timestamp ON completion_logs (user_id, "timestamp");
CREATE INDEX idx_completion_logs_reminder ON completion_logs (reminder_id);
```

**Notes:**
- `user_id` is duplicated here even though it's derivable via `reminder_id → reminders.user_id`. This is intentional denormalization: the weekly stats query (`GET /stats/weekly`) filters directly by `user_id` and a date range on `completion_logs` — requiring a join through `reminders` on every stats query would be needless overhead for a very frequently hit endpoint (Dashboard + Stats screen both call it).
- This table is append-only in practice (a reminder can be marked Later then later Done, producing two rows) — this gives an accurate history of snoozing behavior, which is useful raw material if Phase 2 adds adaptive time-of-day learning, without needing a schema change then.

### 2.6 `refresh_tokens` *(new — required for auth, not in earlier docs)*

```sql
CREATE TABLE refresh_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL UNIQUE,   -- store a hash, never the raw token
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,                     -- NULL = still valid; set on logout or rotation
    replaced_by_token_id UUID REFERENCES refresh_tokens(id),  -- rotation chain, for reuse-detection
    user_agent          VARCHAR(255),
    ip_address          VARCHAR(64)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
```

**Notes:**
- Required to support the TRD's stated refresh-token rotation strategy (Section 5 of the TRD) — this table did not exist in the earlier Implementation Spec and must be added before auth work starts.
- Never store the raw refresh token — only a hash (e.g., SHA-256) of it, same principle as password hashing, so a DB read alone can't be used to impersonate a session.
- `replaced_by_token_id` enables reuse detection: if a token that was already rotated (has a non-null `replaced_by_token_id`) is presented again, that's a signal of possible token theft — the API should revoke the entire chain for that user on detection, not just reject the one request.

### 2.7 `telegram_link_codes` *(new — required for onboarding Step 3 / Settings, not in earlier docs)*

```sql
CREATE TABLE telegram_link_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code                VARCHAR(12) NOT NULL UNIQUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    consumed_at         TIMESTAMPTZ,          -- NULL until used
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_telegram_link_codes_code ON telegram_link_codes (code) WHERE consumed_at IS NULL;
```

**Notes:**
- Required to back the "Generate linking code" flow specified in the UX Flow Document (Section 4.3, Section 10). Not present in the earlier Implementation Spec — flagged there, formalized here.
- Partial unique index (`WHERE consumed_at IS NULL`) allows the same code string to theoretically exist twice across all-time history (once consumed, once fresh) without a real collision risk, while still preventing two simultaneously-active codes from colliding.
- Codes should be short-lived (10 minutes, per UX Flow Document) — expiry enforced at the application layer using `expires_at`, plus a periodic cleanup job (or `expires_at < now()` filter on every lookup) rather than relying on manual deletion.

---

## 3. Relationships Summary Table

| Table | Foreign Key | References | On Delete | Nullable |
|---|---|---|---|---|
| schedule_blocks | user_id | users.id | CASCADE | No |
| goals | user_id | users.id | CASCADE | No |
| reminders | user_id | users.id | CASCADE | No |
| reminders | goal_id | goals.id | SET NULL | Yes |
| completion_logs | reminder_id | reminders.id | CASCADE | No |
| completion_logs | user_id | users.id | CASCADE | No |
| refresh_tokens | user_id | users.id | CASCADE | No |
| refresh_tokens | replaced_by_token_id | refresh_tokens.id | (none — nullable self-reference) | Yes |
| telegram_link_codes | user_id | users.id | CASCADE | No |

---

## 4. Authentication & Session Handling

### 4.1 Password authentication
- Passwords hashed with **bcrypt**, cost factor 12 (per TRD Section 5). Never logged, never returned in any API response, never stored in plaintext even transiently in application memory longer than the hashing call requires.

### 4.2 Token issuance flow
1. On successful login/signup: issue a short-lived **access token** (JWT, 15 min expiry, signed with a server-side secret, containing `user_id` and `exp` claims only — no email/PII in the payload since JWTs are base64, not encrypted) and a **refresh token** (opaque random string, NOT a JWT — stored hashed in `refresh_tokens` per Section 2.6).
2. Access token is used in the `Authorization: Bearer <token>` header for all API calls.
3. Refresh token is delivered via an httpOnly, secure, `SameSite=Strict` cookie (per TRD Section 5) — never exposed to JS, never sent in a JSON response body.

### 4.3 Refresh flow
1. When access token expires (client gets 401), client calls `POST /auth/refresh` with no body (cookie carries the refresh token).
2. Backend looks up the token by hash, checks `revoked_at IS NULL AND expires_at > now()`.
3. If valid: issue a new access token, rotate the refresh token (mark current row `revoked_at = now()`, insert a new row, set `replaced_by_token_id` on the old row), set the new refresh cookie.
4. If the presented token is already revoked but has a `replaced_by_token_id` (i.e., reuse of an old, rotated-out token): treat as a security event — revoke **all** refresh tokens for that `user_id`, force full re-login. This is the standard defense against a stolen refresh token being replayed after the legitimate client already rotated past it.

### 4.4 Logout
`POST /auth/logout` — sets `revoked_at = now()` on the current refresh token row, clears the cookie. Access tokens are not individually revocable (standard JWT tradeoff, acceptable given the 15-minute expiry) — this is a documented tradeoff, not an oversight, matching TRD Section 11's open question #2, now resolved: expiry-only for access tokens, explicit revocation for refresh tokens.

### 4.5 Telegram identity
Telegram has no password/JWT concept from the bot's side. The `telegram_chat_id` on `users` is the sole link. Every inbound Telegram webhook payload is matched against `users.telegram_chat_id` to resolve identity — if no match, the bot treats the sender as unlinked (per UX Flow Document Section 12.10) and does not process any command beyond prompting them to link.

---

## 5. Permissions Model

This MVP has a **single role: authenticated user**, scoped strictly to their own data. There is no admin role, no team/shared data, and no public read access to any table in this schema.

### 5.1 Enforcement pattern
Every query that touches `schedule_blocks`, `goals`, `reminders`, or `completion_logs` **must** include `WHERE user_id = :current_user_id`, where `current_user_id` comes from the verified access token — never from a client-supplied parameter. This is the single most important rule in this document: **no endpoint should ever accept a `user_id` in the request body or query string and use it for a data-access filter.** The identity used for every data query is always derived from the authenticated token, not from client input. This is the direct implementation of the TRD's IDOR-prevention requirement (Section 9 of the TRD).

### 5.2 Recommended implementation pattern (for the agent)
- A single FastAPI dependency (e.g., `get_current_user`) decodes and verifies the access token, loads the `User` row, and is injected into every protected route handler.
- Every service-layer function (`slot_engine`, `allocator`, `stats`) takes `user_id` as an explicit required argument sourced from that dependency — never queries "all schedule blocks" or "all goals" without a user filter, even internally, even in a background job. This applies equally to the `scheduler` container's job execution: each scheduled job run must be scoped to one user at a time, never a cross-user batch query without a `user_id` filter.
- Consider enabling PostgreSQL **Row-Level Security (RLS)** as a defense-in-depth layer in a future hardening pass (not required for MVP, but the schema's consistent `user_id` column on every table makes RLS straightforward to add later without a redesign — worth noting as a natural next step, not a blocker now).

### 5.3 Telegram-originated writes
Actions taken via Telegram (Done/Later/Skip buttons, `/add` command) go through the same backend API and the same ownership rule — the `telegram` bot service resolves `user_id` from `telegram_chat_id` first (Section 4.5), then calls the backend exactly as the web frontend would, with that resolved `user_id`'s context. The bot process itself must never be granted a blanket service-level credential that can write as any user without that resolution step.

---

## 6. Data Ownership Rules (Summary)

| Rule | Applies to |
|---|---|
| Every row is owned by exactly one `user_id`; there is no shared/team data in MVP. | All tables except `users` |
| A user can only read/write/delete their own rows. No cross-user visibility exists anywhere in MVP. | All tables |
| Deleting a user cascades to all their schedule blocks, goals, reminders, completion logs, refresh tokens, and telegram link codes. | Section 3 (CASCADE rules) |
| Deleting a goal does not delete historical reminders/completion logs tied to it — it nulls the reference and relies on the denormalized `label` snapshot. | reminders, completion_logs |
| Telegram chat ID is a 1:1 link to exactly one user account; the same Telegram account cannot be linked to two app accounts simultaneously. | users, telegram_link_codes |
| Refresh tokens are single-use-then-rotated; reuse of a superseded token revokes the entire session chain for that user. | refresh_tokens |

---

## 7. Indexing Summary (Rationale Recap)

| Index | Reason |
|---|---|
| `users(LOWER(email))` unique | Case-insensitive login lookup, most frequent auth query |
| `users(telegram_chat_id)` unique, partial | Fast webhook identity resolution; partial to allow multiple NULLs (unlinked users) |
| `schedule_blocks(user_id, day_of_week)` | Every schedule read is per-user, grouped by day |
| `goals(user_id, is_active)` | Allocator's hot-path query: "this user's active goals" |
| `reminders(user_id, scheduled_time)` | Scheduler's time-range sweep per user |
| `reminders(user_id, status)` | Reminders screen status filter |
| `reminders(goal_id)` partial | Occasional lookup, low priority, partial index avoids indexing NULL-heavy manual reminders |
| `completion_logs(user_id, timestamp)` | Weekly stats date-range query, most frequent read on this table |
| `completion_logs(reminder_id)` | Lookup all status changes for one reminder (e.g., audit/debug) |
| `refresh_tokens(token_hash)` unique | Refresh flow's primary lookup, must be fast and collision-safe |
| `telegram_link_codes(code)` unique, partial | Bot-side code lookup during linking; partial avoids uniqueness conflicts with historical consumed codes |

---

## 8. Explicit Non-Goals for This Schema (MVP)

- No soft-delete / row versioning — deletions are hard deletes (except goal→reminder relationship, which is intentionally preserved via `SET NULL`).
- No multi-tenancy / organization-level tables — single-user-owns-everything model only.
- No row-level security policies enabled in Postgres itself for MVP (enforced at application layer only, per Section 5.2) — RLS is a noted future hardening step, not a v1 requirement.
- No audit log table beyond `completion_logs` (which is domain data, not a general audit trail) — general audit logging (e.g., of MCP tool calls) is explicitly Phase 2+ per the TRD.
- No GDPR-style data export/right-to-erasure tooling — flagged here as a gap the team should decide on before any real user data is collected in production, but out of scope for this schema document to design.

---

*This document is the authoritative source for database structure. Where the Implementation Spec's earlier schema section (Section 3 of that document) differs from this one — specifically the addition of `timezone` on `users`, and the new `refresh_tokens` and `telegram_link_codes` tables — this document wins. The Implementation Spec should be updated to reference this document rather than maintaining a second copy of the schema.*
