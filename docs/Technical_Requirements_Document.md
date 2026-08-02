# Technical Requirements Document (TRD)
## AI-Powered Personal Time Intelligence Platform

**Companion to:** PRD_AI_Personal_Time_Intelligence_Platform.md, Implementation_Spec_and_Sprint_Backlog.md
**Author:** Senior Software Architect (draft)
**Version:** 1.0
**Scope:** MVP (Phase 1) architecture, with Phase 2 extension points noted but not designed in detail

---

## 1. Architecture Overview

### 1.1 Architectural style
**Modular monolith**, not microservices, for MVP.

**Reasoning:** The system has clear internal boundaries (schedule engine, allocator, scheduler, bot, API) but low team size and low initial scale don't justify the operational overhead of microservices (service discovery, distributed tracing, network failure handling). A modular monolith with clean internal module boundaries (as already reflected in the `backend/app/services/` structure) gets the same separation of concerns without the deployment complexity. Services can be split out later (e.g., scheduler as its own service) once load or team size demands it — the module boundaries are drawn so that split is straightforward, not a rewrite.

### 1.2 High-level component diagram (textual)

```
[React Frontend] ──HTTP/JSON──▶ [FastAPI Backend] ──SQL──▶ [PostgreSQL]
                                        │
                                        ├──▶ [APScheduler (Postgres job store)]
                                        │            │
                                        │            ▼
                                        │     [Scheduler Dispatcher]
                                        │            │
                                        ▼            ▼
                              [Telegram Bot Service] ──▶ [Telegram Bot API]
                                        ▲
                                        │ (Phase 2)
                              [Voice/LLM/MCP Layer] (stubbed, not built in MVP)
```

### 1.3 Process/deployment topology
Four containers for MVP:
1. `backend` — FastAPI app (REST API + business logic)
2. `telegram` — Telegram bot process (webhook receiver + command handlers)
3. `scheduler` — APScheduler worker process (separate from `backend` to avoid duplicate job execution — see Section 6)
4. `db` — PostgreSQL

Frontend is a static build served separately (e.g., via Nginx container or static hosting) since it's a minimal setup UI, not a heavy SPA in MVP.

---

## 2. Frontend Stack

| Decision | Choice | Reason |
|---|---|---|
| Framework | React (Vite, not CRA) | Vite gives faster dev builds and is the current standard; CRA is effectively unmaintained. |
| Styling | Tailwind CSS | Matches PRD tech stack; fast to build simple forms/dashboard without a design system overhead appropriate for MVP scope. |
| State management | React Context + hooks (no Redux) | MVP frontend is form-heavy (schedule/goal entry) and a basic stats view — Redux/Zustand is unjustified complexity at this scope. |
| API client | `fetch` wrapped in a thin typed client (or `axios` if the team prefers interceptor-based auth header injection) | Keep dependency footprint minimal. |
| Routing | React Router | Standard, minimal learning curve. |

**Explicitly deferred:** No SSR (Next.js) — MVP frontend has no SEO requirement and is behind auth, so client-side rendering is sufficient and simpler to deploy.

---

## 3. Backend Stack

| Decision | Choice | Reason |
|---|---|---|
| Framework | FastAPI (Python 3.11+) | Async support (needed for Telegram webhook + DB I/O concurrency), automatic OpenAPI docs (useful for a coding agent and open-source contributors to understand the API surface), strong typing via Pydantic reduces integration bugs. |
| ORM | SQLAlchemy 2.0 (async) + Alembic for migrations | Mature, well-documented, works cleanly with FastAPI's async model; Alembic gives reproducible schema history — important since the schema will evolve into Phase 2. |
| Validation | Pydantic v2 | Native to FastAPI, enforces the exact schema contracts defined in the Implementation Spec, reducing free-text/hallucinated field risk when an agent is generating code against this doc. |
| Background jobs | APScheduler with `SQLAlchemyJobStore` (Postgres-backed) | Rejected in-memory job store explicitly — in-memory jobs are lost on restart and duplicate across multiple worker instances. Postgres-backed store is durable and safe to run as a single dedicated `scheduler` container. |
| Task/job separation | Scheduler runs as its own container/process, not inside the API server process | Prevents duplicate job firing if the API is horizontally scaled (e.g., 2 backend replicas) — only one scheduler process should own job execution. |

**Why not Celery for MVP:** Celery + Redis/RabbitMQ is more robust at scale but adds a message broker dependency the MVP doesn't need yet. APScheduler with a Postgres job store is the smallest dependency set that is still safe (no duplicate execution, survives restarts). **Migration trigger to Celery:** if reminder volume or worker count grows enough that a single scheduler process becomes a bottleneck, or if you need retries/rate-limiting on job execution — that's a Phase 2+/scale decision, not MVP.

---

## 4. Database

| Decision | Choice | Reason |
|---|---|---|
| Engine | PostgreSQL 15+ | Relational integrity needed (foreign keys between users/schedule/goals/reminders), strong support for `enum`, `time`, and `timestamp` types matching the schema in the Implementation Spec; also the PRD's stated choice. |
| Schema management | Alembic migrations, checked into `backend/app/db/migrations/` | Reproducible, reviewable schema changes — critical for an open-source project with multiple contributors. |
| Connection pooling | SQLAlchemy async engine with pool_size tuned per deployment (default pool_size=5 for MVP single-instance) | Avoid connection exhaustion; MVP traffic is low so default pooling is sufficient — revisit under load. |
| Timezones | All timestamps stored in UTC; conversion to user-local time happens at the API/bot layer using a `timezone` field on `users` | Prevents subtle bugs from storing local time; single source of truth for time math (slot detection, allocator) in UTC. **Note:** Implementation Spec's `users` table should be extended with a `timezone` column — flagging this as a required addition. |

---

## 5. Authentication

| Decision | Choice | Reason |
|---|---|---|
| Primary auth | Email + password, JWT (access token + refresh token) | Simple, no third-party dependency, works for both frontend and any future mobile client. |
| Password storage | bcrypt (via `passlib`) | Industry-standard, resistant to rainbow-table attacks, well-supported in Python. |
| Token strategy | Short-lived access token (15 min) + longer-lived refresh token (7–30 days), refresh token rotated on use | Limits exposure window if an access token leaks; rotation limits refresh-token replay risk. |
| Telegram account linking | One-time, short-expiry (e.g., 10-minute) linking code generated by the backend, entered into the bot to bind `telegram_chat_id` to the authenticated user | Avoids exposing user IDs or emails to the bot directly; prevents account-linking hijack via guessable IDs. |
| Session/token storage (frontend) | Access token in memory, refresh token in httpOnly secure cookie | Avoids XSS-based token theft via `localStorage`; httpOnly cookie is not accessible to JS. |

**Deferred to Phase 2+:** OAuth/social login, Google Calendar OAuth (needed only once calendar sync is built).

---

## 6. APIs

### 6.1 API style
REST over HTTP/JSON, matching the endpoint list in the Implementation Spec (Section 5 of that document). No GraphQL — the data model is simple and doesn't have the nested-query complexity that would justify GraphQL's overhead.

### 6.2 API contract source of truth
FastAPI's auto-generated OpenAPI schema (`/docs`, `/openapi.json`) is the canonical, always-current contract. The Implementation Spec's endpoint list is the intended design; the OpenAPI schema generated from actual code is authoritative once implementation starts — the agent should keep these in sync and flag any drift.

### 6.3 Telegram Bot integration
Webhook-based (not long-polling) for production, since webhook mode is more efficient and scales better under Docker/behind a reverse proxy with a public HTTPS endpoint. Long-polling is acceptable for local development only.

### 6.4 Internal service communication
Since this is a modular monolith, `scheduler` and `telegram` containers communicate with `backend` via the same REST API (not direct DB access), except where a shared internal library is used for models. This keeps a single write-path through the API layer, which:
- Centralizes validation and auth
- Avoids the `scheduler`/`telegram` containers needing raw DB credentials
- Makes the later transition to real microservices easier if needed

**Exception:** the `scheduler` container's job execution reads free-slot/allocation data computed by `slot_engine.py`/`allocator.py`. These are pure functions with no side effects — they should be packaged as a shared internal Python package importable by both `backend` and `scheduler`, rather than duplicated code or an extra network hop for pure computation.

---

## 7. Architecture Decisions Log (Key Technical Decisions + Reasoning)

| # | Decision | Alternative considered | Reason for choice |
|---|---|---|---|
| 1 | Modular monolith over microservices | Microservices per module | Team size and MVP scale don't justify distributed-systems overhead; module boundaries already support a future split. |
| 2 | APScheduler + Postgres job store over Celery+Redis | Celery + Redis/RabbitMQ | Fewer moving parts for MVP; durable and safe against duplicate firing without adding a broker dependency. |
| 3 | Scheduler as separate container from API server | Run scheduler in-process with API | Prevents duplicate job execution if API is horizontally scaled. |
| 4 | REST over GraphQL | GraphQL | Data model is simple/flat; REST is faster to build and matches FastAPI's strengths (auto docs, Pydantic validation). |
| 5 | Webhook-based Telegram integration | Long-polling | More efficient and production-appropriate; polling reserved for local dev only. |
| 6 | JWT with refresh rotation over session cookies alone | Server-side session store | Stateless auth scales more easily and avoids a session store dependency; refresh rotation mitigates the main downside (token replay). |
| 7 | UTC storage with per-user timezone field | Store local time directly | Avoids daylight-saving and multi-timezone bugs in slot-detection math. |
| 8 | Pure-function slot engine/allocator shared as internal package | Reimplement logic in each service that needs it | Single source of truth for scheduling logic; avoids drift between backend and scheduler behavior. |
| 9 | No SSR frontend for MVP | Next.js | No SEO need (auth-gated app); SPA is simpler to deploy as a static build behind the API. |
| 10 | Docker Compose over Kubernetes for MVP deployment | K8s | Team size/scale doesn't justify K8s operational overhead yet; Compose is sufficient for a 4-container MVP and easier for open-source contributors to run locally. |

---

## 8. Deployment Plan

### 8.1 MVP deployment target
Single-host Docker Compose deployment (e.g., a VPS — DigitalOcean/Hetzner/similar), fronted by an Nginx or Caddy reverse proxy for HTTPS termination (required for the Telegram webhook, which mandates HTTPS).

### 8.2 Environments
- **Local dev:** Docker Compose, Telegram bot in long-polling mode, `.env` from `.env.example`.
- **Staging:** Same Compose setup on a low-spec VPS, webhook mode, separate Telegram bot token and DB from production.
- **Production:** Docker Compose on a dedicated VPS (or migrate to a managed container platform later if load requires), webhook mode, automated backups on the Postgres volume.

### 8.3 CI/CD
- GitHub Actions (matches the GitHub-hosted open-source repo assumption):
  - Lint + unit test on every PR (backend `pytest`, frontend `eslint`/`vitest`)
  - Build and push Docker images on merge to `main`
  - Manual or tag-triggered deploy step for production (avoid auto-deploy to prod for an early-stage project without a rollback strategy in place)

### 8.4 Database migrations in deployment
Alembic migrations run as a one-off container/init step before the `backend` container starts, not automatically inside the app's startup event — keeps migration failures visible and blocking rather than silently retried.

### 8.5 Backups
Automated daily Postgres dump to object storage (e.g., S3-compatible), retained for at least 14 days. Required from day one of production, since this app holds users' personal schedule and habit data — losing it would be a trust-breaking failure, not just an inconvenience.

---

## 9. Security Requirements

| Area | Requirement | Reason |
|---|---|---|
| Transport | HTTPS everywhere (API, frontend, Telegram webhook) — no plain HTTP in staging/production | Telegram requires HTTPS for webhooks; also standard baseline for any app handling auth credentials. |
| Password handling | bcrypt hashing, minimum password complexity enforced client- and server-side | Prevent trivial credential compromise. |
| Secrets management | All secrets (DB credentials, JWT signing key, Telegram bot token) in environment variables via `.env`, never committed; `.env.example` committed with placeholder values only | Standard practice; critical for an open-source repo where accidental secret commits are a common leak vector. |
| Authorization | Every API endpoint scoped to `user_id` from the authenticated JWT; no endpoint should accept a client-supplied `user_id` for data access | Prevents one user from reading/modifying another user's schedule, goals, or reminders (IDOR prevention). |
| Rate limiting | Basic rate limiting on `/auth/login` and `/auth/signup` (e.g., via `slowapi` or reverse-proxy level) | Mitigate brute-force and credential-stuffing attempts. |
| Input validation | All request bodies validated via Pydantic schemas; reject unexpected fields | Reduces injection and malformed-data risk; also keeps the API contract honest for agent-generated code. |
| SQL injection | Exclusively use SQLAlchemy ORM/parameterized queries — no raw string-interpolated SQL | Standard prevention; enforced via code review/lint rule if possible. |
| Telegram webhook validation | Verify incoming webhook requests via Telegram's provided secret token header | Prevents spoofed requests to the bot webhook endpoint. |
| Dependency hygiene | Automated dependency vulnerability scanning (e.g., `pip-audit`, `npm audit`, or GitHub Dependabot) in CI | Standard hygiene for an open-source project accepting external contributions. |
| Data minimization | Store only what's needed for scheduling/reminders — no unnecessary PII beyond email and (optionally) timezone | Reduces breach impact and simplifies any future privacy/compliance work. |
| CORS | Restrict API CORS origins to known frontend domain(s); no wildcard `*` in production | Prevents arbitrary third-party sites from calling the authenticated API from a user's browser session. |

**Explicitly deferred to Phase 2+ (flag, don't build now):** Full audit logging of MCP tool calls (mentioned in the PRD for Phase 2), since MCP isn't in MVP scope. Data encryption at rest beyond standard managed Postgres disk encryption is not required at MVP scale but should be revisited if the user base or data sensitivity grows.

---

## 10. Non-Functional Requirements Summary

| Attribute | Target for MVP |
|---|---|
| Availability | Best-effort single-host uptime; no HA requirement for MVP (documented tradeoff, not an oversight) |
| Latency | API responses <300ms for CRUD endpoints under normal load; slot computation <1s for a single user's week |
| Scalability | Designed to support horizontal scaling of the `backend` container later (stateless API + externalized scheduler) without a redesign |
| Observability | Structured logging (JSON logs) from `backend`, `telegram`, and `scheduler`; basic uptime monitoring (e.g., health check endpoint `/health`) — full APM/tracing deferred |
| Maintainability | Enforced via the fixed folder structure and shared internal package for scheduling logic (Section 6.4), so contributors have one place to change core behavior |

---

## 11. Open Technical Questions for Review

1. Managed Postgres (e.g., a cloud provider's managed DB) vs. self-hosted in the Compose stack for production — affects backup/ops burden.
2. Should refresh tokens be revocable (requiring a token denylist/store) for MVP, or is expiry-only acceptable given low initial user count?
3. VPS provider and reverse proxy choice (Nginx vs. Caddy) — Caddy gives automatic HTTPS cert management with less config, worth defaulting to unless the team has existing Nginx expertise.
4. Confirm `users.timezone` addition to the Implementation Spec's schema (Section 4 of this document) before backend work starts, since slot-detection correctness depends on it.

---

*This TRD should be read alongside the Implementation Spec's Section 3 (DB Schema) and Section 5 (API Endpoints) — this document adds the "why" and the surrounding infrastructure; the Implementation Spec remains the source of truth for exact field/endpoint names.*
