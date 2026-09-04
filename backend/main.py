from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.endpoints import auth, goals, reminders, schedule, slots, users
from app.core.config import settings
from app.core.rate_limit import limiter

app = FastAPI(title="Personal Time Intelligence API")

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
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])
app.include_router(goals.router, prefix="/api/goals", tags=["goals"])
app.include_router(slots.router, prefix="/api/slots", tags=["slots"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
