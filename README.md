# Smart Habit Tracker

An AI-powered personal time intelligence platform: it reads your weekly
schedule, finds the gaps, and nudges you through Telegram at a moment you are
actually free.

The planning documents this is built from (PRD, technical requirements, screen
flows, schema, phased plan) live in `docs/`, which is not tracked in this
repository — ask the maintainer if you need them.

---

## Running it locally

### What you need

| | |
|---|---|
| Docker Desktop | runs the whole stack |
| Node 22 | the frontend dev server and its tests |
| Python 3.11 | only if you want to run backend tests outside Docker |
| A Telegram bot token | from [@BotFather](https://t.me/BotFather) — optional until you want reminders |

> **Node 22, not newer.** vitest 5's workers hang on Node 24 (they never
> respond and the run times out with no tests executed). CI pins 22.

---

### Getting it running

```bash
git clone <this repo>
cd smart-habit-tracker
cp .env.example .env      # then edit it, see below
docker compose up --build
```

That builds four containers — Postgres, the API, the Telegram bot, and the
scheduler — applies the migrations, and leaves the API on
<http://localhost:8000>. Check it:

```bash
curl http://localhost:8000/health     # {"status":"ok"}
```

The frontend is *not* in that command by default, because you almost always
want the hot-reloading dev server instead:

```bash
cd frontend
npm ci
npm run dev                            # http://localhost:5173
```

It proxies `/api` and `/auth` through to the backend, so nothing else to
configure. (`docker compose --profile full up` builds the static production
frontend instead, if you want to check that specifically.)

---

### Filling in `.env`

`.env.example` documents every key. Four are worth calling out:

```bash
# Generate real values for both of these:
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_API_KEY=$(openssl rand -hex 32)   # the bot and scheduler present this
                                           # on /internal/*; it must match the
                                           # backend's

COOKIE_SECURE=false        # the refresh cookie is HTTPS-only otherwise, so
                           # local plain-http login silently fails to persist

TELEGRAM_WEBHOOK_URL=      # leave EMPTY locally -> the bot long-polls.
                           # Setting it switches to webhook mode, which needs a
                           # public HTTPS URL Telegram can actually reach.
```

Two things that will waste your afternoon if you get them wrong:

- **The setting is `JWT_SECRET`, not `JWT_SECRET_KEY`.** A misspelled key is
  ignored silently and the app falls back to its insecure built-in default.
- **Leave `DATABASE_URL` commented out.** It overrides the `POSTGRES_*` parts,
  so a `localhost` URL there means the backend container tries to reach a
  database inside itself and dies. Let it be assembled instead.

---

### Connecting Telegram

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, follow it.
2. Put the token in `TELEGRAM_BOT_TOKEN` and the name (no `@`) in
   `TELEGRAM_BOT_USERNAME`.
3. `docker compose up -d --build telegram`
4. In the web app: Settings → Telegram → **Generate linking code**.
5. Send that code to your bot. It should reply "Connected".

Then `/help` in the chat lists everything the bot can do.

---

## Running the tests

Four suites, one per package. CI runs all four.

The backend suite needs a Postgres; the compose one does fine. Take the user,
password and port from your own `.env` — the placeholders below show what to
substitute.

```bash
docker compose up -d db
docker exec time_intel_db psql -U postgres -c "CREATE DATABASE smart_habit_tracker_test"
docker compose port db 5432          # prints the <HOST_PORT> to use

cd backend
python -m venv venv
venv/bin/pip install -r requirements-dev.txt        # Windows: venv/Scripts/pip
export DATABASE_URL="postgresql+asyncpg://<USER>:<PASSWORD>@localhost:<HOST_PORT>/smart_habit_tracker_test"
export JWT_SECRET=test COOKIE_SECURE=false RATE_LIMIT_ENABLED=false
venv/bin/pytest -q
```

The bot and scheduler suites need neither a database nor a network:

```bash
cd telegram  && pip install -r requirements-dev.txt && pytest -q
cd scheduler && pip install -r requirements-dev.txt && pytest -q
cd frontend  && npm run test:run && npm run typecheck && npm run lint
```

---
## How the pieces fit

```
browser ──> frontend (Vite/React)
                │  /api, /auth
                v
            backend (FastAPI) ──> Postgres
                ^   ^
   /internal/* │   │ /internal/*
                │   │
          telegram   scheduler
           (bot)     (APScheduler)
                │
                v
          Telegram Bot API
```

Two rules the architecture depends on:

- **The bot and scheduler never touch the database.** They swap a chat id for a
  short-lived user token at `/internal/telegram/token` and then call the same
  `/api` routes the browser does, so ownership checks and validation live in one
  place.
- **The scheduler is its own container**, so exactly one process owns job
  execution and nobody gets reminded twice
  (TRD Section 6).

---

## Deploying

Single host, Docker Compose, Caddy in front for HTTPS — Telegram will not
deliver webhooks to anything else.

```bash
# On the VPS, with .env filled in for this environment:
export DOMAIN=your-host.example.com
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production overlay differs from local in ways that matter:

- **Migrations run as their own one-off service** that the API waits on, so a
  bad migration stops the deploy instead of leaving an API serving against a
  schema it does not match (TRD 8.4).
- **Only Caddy publishes ports.** The database, API, bot and scheduler are
  reachable only on the compose network — `/internal/*` is deliberately not
  routed, so the bot-and-scheduler endpoints cannot be reached from outside.
- **No source bind-mounts**, so the image is exactly what runs.
- **The bot runs in webhook mode**, which is why the HTTPS is not optional. Set
  `TELEGRAM_WEBHOOK_URL=https://$DOMAIN/telegram/webhook` and a random
  `TELEGRAM_WEBHOOK_SECRET`.

Staging and production must use **separate bot tokens and separate databases**.
One bot cannot serve two environments: Telegram delivers each update once, so
whichever environment registered the webhook last silently swallows the other's
traffic.

### Backups

`docker/backup.sh` dumps the database, keeps 14 days, and uploads off-host.
Install it on the host, not in a container:

```bash
0 3 * * *  /opt/smart-habit-tracker/docker/backup.sh >> /var/log/sht-backup.log 2>&1
```

Set `S3_TARGET` to somewhere off this machine. A backup that lives on the VPS
does not survive losing the VPS, which is the case it exists for. The script
fails loudly on a suspiciously small dump rather than reporting success.

Restore:

```bash
gunzip -c smart_habit_tracker-<stamp>.sql.gz | docker exec -i time_intel_db psql -U postgres -d smart_habit_tracker
```

---

## When something looks wrong

| Symptom | Cause |
|---|---|
| `env: 'sh\r': No such file or directory` | A shell script got CRLF endings. `.gitattributes` prevents this; if you see it, re-clone or run `git add --renormalize .` |
| Backend exits with `SettingsError` | A malformed value in `.env` — the message names the field |
| Backend can't reach the database | `DATABASE_URL` is set in `.env`; comment it out |
| Bot: `Cannot close a running event loop` | You are on an old checkout; `run_polling` must not be awaited |
| Bot ignores you | It is not linked. Send it your code from Settings first |
| No reminders arrive | Check `docker logs time_intel_scheduler`. Reminders only fire for a slot starting within 15 minutes, and only once per slot |
| Login doesn't persist | `COOKIE_SECURE=true` over plain http |
| `vitest` times out with no tests | You are on Node 24. Use Node 22 |

Logs for any container:

```bash
docker compose logs -f backend    # or telegram, scheduler, db
```
