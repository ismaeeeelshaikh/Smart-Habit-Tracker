# Smart Habit Tracker

**A habit tracker that reads your timetable instead of nagging you at 7pm every day.**

[![CI](https://github.com/ismaeeeelshaikh/Smart-Habit-Tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/ismaeeeelshaikh/Smart-Habit-Tracker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Most habit apps ask you to pick a time and then remind you at that time forever.
That works until real life happens — you are in a lecture at 7pm on Tuesdays,
so you dismiss the reminder, and dismissing it becomes the habit instead.

This one asks for your weekly commitments once, works out where the gaps
actually are, and messages you on Telegram during one of them.

---

## How it works

```
    you tell it once                it works out                 it messages you
 ┌──────────────────────┐      ┌────────────────────┐      ┌──────────────────────┐
 │ College  Mon 9–3     │      │ free: 3:00–10:00pm │      │ You have a free      │
 │ Gym      Tue 6–7pm   │ ───▶ │ pick by priority   │ ───▶ │ 2 hr slot at 5:00 PM │
 │                      │      │ that fits the gap  │      │ Suggested: Revise DSA│
 │ Goal: Revise DSA     │      │                    │      │ ✅ Done ⏳ Later ❌ Skip│
 │   high · 30 min      │      │                    │      └──────────────────────┘
 └──────────────────────┘      └────────────────────┘
```

You tap a button in Telegram; it records what happened and that feeds your
weekly numbers. The scheduling is plain arithmetic on your calendar — no model
decides when you are free, so the same schedule always produces the same answer.

---

## What it does

- **Finds your real free time.** Fixed blocks ("College, Mon 9–3") and loose
  ones ("Sunday: family") both count. Gaps outside your active hours never get
  suggested — nobody wants a 3am study reminder.
- **Suggests by priority.** High-priority goals get the good slots; a 30-minute
  goal is not offered a 15-minute gap.
- **Delivers on Telegram**, so there is no app to open and nothing to remember.
- **Acts in one tap.** ✅ Done · ⏳ Later · ❌ Skip, straight from the message.
- **Leaves you alone when you say so.** Later or Skip buys an hour of quiet.
  Only Done clears the way for the next suggestion.
- **Counts honestly.** Completion rate by priority, and the goal you skip most —
  raw numbers, no encouraging fiction.

---

## Quick start

You need **Docker**, **Node 22** (not 24 — see below), and a Telegram bot token
from [@BotFather](https://t.me/BotFather) if you want reminders.

```bash
git clone https://github.com/ismaeeeelshaikh/Smart-Habit-Tracker.git
cd Smart-Habit-Tracker
cp .env.example .env      # then edit it, see below
docker compose up --build
```

That starts Postgres, the API, the bot and the scheduler, and applies the
migrations. Check it:

```bash
curl http://localhost:8000/health     # {"status":"ok"}
```

The frontend runs separately in dev, so you get hot reload:

```bash
cd frontend
npm ci
npm run dev                            # http://localhost:5173
```

### Filling in `.env`

`.env.example` documents every key. Four matter more than the rest:

```bash
JWT_SECRET=$(openssl rand -hex 32)          # generate a real one
INTERNAL_API_KEY=$(openssl rand -hex 32)    # the bot and scheduler present this

COOKIE_SECURE=false        # the refresh cookie is HTTPS-only otherwise, so
                           # login over plain http silently fails to persist

TELEGRAM_WEBHOOK_URL=      # leave EMPTY locally -> the bot long-polls.
                           # Setting it needs a public HTTPS URL Telegram can reach.
```

Two things that will cost you an afternoon:

- **The key is `JWT_SECRET`, not `JWT_SECRET_KEY`.** A misspelled name is
  ignored in silence and the app falls back to an insecure default.
- **Leave `DATABASE_URL` commented out.** It overrides the `POSTGRES_*` parts,
  so a `localhost` URL makes the backend look for a database inside its own
  container.

### Connecting Telegram

1. Message [@BotFather](https://t.me/BotFather), send `/newbot`, follow it.
2. Put the token in `TELEGRAM_BOT_TOKEN` and the name (no `@`) in
   `TELEGRAM_BOT_USERNAME`, then `docker compose up -d --build telegram`.
3. In the web app: **Settings → Telegram → Generate linking code**.
4. Send that code to your bot. It replies "Connected".

The code is a one-time password proving that Telegram account is yours. It
lasts 10 minutes; generate another if it lapses.

---

## Using it

### The web app

| Screen | For |
|---|---|
| **Dashboard** | Today's free slots, the next suggestion, this week at a glance |
| **Schedule** | Your weekly commitments — the input everything else depends on |
| **Goals** | What you want time for, with a priority and a duration |
| **Reminders** | History and status, and a form to add one by hand |
| **Stats** | Completion rate per priority, and your most-skipped goal |
| **Settings** | Active hours, password, Telegram connection |

**Add your real schedule first.** With an empty schedule the app believes you
are free from 8am to 10pm every day, and its suggestions are meaningless.

### The bot

| Command | Does |
|---|---|
| `/today` | Today's commitments and the gaps between them |
| `/free` | Just the free time left today |
| `/next` | Your next suggested task, with Done / Later / Skip buttons |
| `/add` | Sets a reminder — asks name, date, time, repeat |
| `/stats` | This week's numbers |
| `/schedule` | The whole week |
| `/help` | The list above |

Reminders also arrive on their own, without you asking — that is the point of
the thing. The scheduler checks every five minutes and messages you when a free
slot is about to start.

`/add` takes times how you would write them: `9:30 pm`, `9pm`, `21:30`. Dates
take `today` and `tomorrow` as well as `2026-09-10`.

---

## How it is built

```
browser ──▶ frontend (React, Vite, Tailwind)
                │  /api, /auth
                ▼
            backend (FastAPI) ──▶ Postgres
                ▲   ▲
   /internal/* │   │ /internal/*
                │   │
          telegram   scheduler
        (python-     (APScheduler)
      telegram-bot)      │
                │        │
                ▼        ▼
            Telegram Bot API
```

Two rules the design leans on:

- **The bot and scheduler never touch the database.** They exchange a chat id
  for a short-lived user token and then call the same `/api` routes the browser
  does, so ownership checks and validation live in exactly one place.
- **The scheduler is its own container**, so one process owns job execution and
  nobody is reminded twice.

Slot detection and allocation are pure functions shared by the API and the
scheduler — same code, one implementation, deterministic output.

---

## Running the tests

373 tests across four suites. CI runs all of them, plus image builds for x86 and
ARM.

```bash
# Backend — needs Postgres. Use the compose one; take user, password and port
# from your own .env.
docker compose up -d db
docker exec time_intel_db psql -U postgres -c "CREATE DATABASE smart_habit_tracker_test"
docker compose port db 5432          # prints the <HOST_PORT> below

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

> **Use Node 22.** vitest 5's workers hang on Node 24 — the run times out having
> executed nothing. CI pins 22.

---

## Deploying

Free, permanently, without buying a server or a domain — see
**[DEPLOYING.md](DEPLOYING.md)**.

The short version: most free tiers sleep a service after ~15 minutes of no HTTP
traffic, which kills the scheduler and with it the whole point of the product.
Oracle Cloud Always Free gives a real VM that stays awake, and
`docker-compose.prod.yml` runs on it unchanged.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `env: 'sh\r': No such file or directory` | A shell script picked up CRLF endings. `.gitattributes` prevents it; if you see it, re-clone or `git add --renormalize .` |
| Backend exits with `SettingsError` | A malformed value in `.env` — the message names the field |
| Backend cannot reach the database | `DATABASE_URL` is set in `.env`; comment it out |
| Bot ignores you | It is not linked. Send it your code from Settings |
| No reminders arrive | Check `docker compose logs scheduler`. They only fire for a slot starting within 15 minutes, once per hour unless you tap Done |
| Times are hours out | The container is missing `tzdata`, so your timezone silently fell back to UTC. Rebuild |
| Login does not persist | `COOKIE_SECURE=true` over plain http |
| `vitest` times out having run nothing | You are on Node 24. Use Node 22 |

```bash
docker compose logs -f backend    # or telegram, scheduler, db
```

---

## Contributing

Issues and pull requests are welcome.

- Run the four test suites before opening a PR; CI runs the same ones.
- The planning documents (PRD, technical requirements, screen flows, schema)
  are not tracked in this repository — ask if you need them for a change that
  touches product behaviour.
- Keep scheduling logic free of any model or API call. It is deliberately
  deterministic: the same schedule must always produce the same answer.

## License

[MIT](LICENSE) — use it, fork it, run your own.
