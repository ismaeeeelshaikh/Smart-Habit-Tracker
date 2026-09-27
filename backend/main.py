import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import deps
from app.api.endpoints import (
    auth,
    days_off,
    goals,
    internal,
    reminders,
    schedule,
    slots,
    stats,
    telegram,
    users,
    webhook,
)
from app.core.config import settings
from app.core.rate_limit import limiter

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run the bot alongside the API, when there is a bot to run.

    Without a token — the test suite, a fresh clone — the API serves normally
    and /telegram/webhook answers 503 instead.
    """
    app.state.bot = None
    if settings.TELEGRAM_BOT_TOKEN:
        from app.bot import application as bot

        app.state.bot = bot.build()
        await bot.start(app.state.bot)
    else:
        log.info("TELEGRAM_BOT_TOKEN is not set — the bot is off")

    yield

    if app.state.bot is not None:
        from app.bot import application as bot

        await bot.stop(app.state.bot)


app = FastAPI(title="Personal Time Intelligence API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
# Everything under /api needs a confirmed email (when verification is on);
# /auth stays open so a new account can sign in and enter its code.
verified = [Depends(deps.require_verified_email)]
app.include_router(users.router, prefix="/api/users", tags=["users"], dependencies=verified)
app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"], dependencies=verified)
app.include_router(goals.router, prefix="/api/goals", tags=["goals"], dependencies=verified)
app.include_router(days_off.router, prefix="/api/days-off", tags=["days-off"], dependencies=verified)
app.include_router(slots.router, prefix="/api/slots", tags=["slots"], dependencies=verified)
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"], dependencies=verified)
app.include_router(stats.router, prefix="/api/stats", tags=["stats"], dependencies=verified)
app.include_router(telegram.router, prefix="/api/telegram", tags=["telegram"], dependencies=verified)
# Telegram posts updates here; authenticated by the webhook secret, not a user.
app.include_router(webhook.router, prefix="/telegram", tags=["telegram"])
# Service-to-service, shared-key authenticated — not part of the public surface.
app.include_router(internal.router, prefix="/internal", tags=["internal"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
