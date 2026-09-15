from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# repo root = backend/app/core/config.py -> backend/app/core -> backend/app -> backend -> <root>
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    # --- Database ---------------------------------------------------------
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "smart_habit_tracker"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    # If set explicitly it wins; otherwise it is assembled from the parts above.
    DATABASE_URL: str | None = None

    # --- Auth -------------------------------------------------------------
    JWT_SECRET: str = "super_secret_dev_key_only"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # Refresh cookie is sent over HTTPS only. Turn off for plain-http local dev.
    COOKIE_SECURE: bool = True
    # "lax" suits local dev, where the Vite proxy makes the API same-origin.
    # Production with the frontend and API on different sites needs "none":
    # browsers withhold a Lax cookie from cross-site requests, so the refresh
    # call would arrive without it and every session would end with its first
    # access token. "none" is only accepted together with COOKIE_SECURE=true.
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    # --- API --------------------------------------------------------------
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    # NoDecode: without it pydantic-settings JSON-decodes list fields straight
    # from the environment and fails before the validator below ever runs, so a
    # plain "a,b" value — which is what .env.example documents — is an error.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    # Turned off in the test suite so auth tests aren't throttled.
    RATE_LIMIT_ENABLED: bool = True
    # Shared secret the telegram/scheduler containers use to reach /internal/*.
    INTERNAL_API_KEY: str = "dev_internal_key_only"

    # --- Telegram ---------------------------------------------------------
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""
    # 10 minutes per App Flow Document Section 4.3 ("Code expired (>10 min unused)").
    TELEGRAM_LINK_CODE_TTL_MINUTES: int = 10

    # --- Dispatch ---------------------------------------------------------
    # How long the bot stays quiet after a reminder the user ignored,
    # snoozed with Later, or skipped. Only Done clears it early.
    QUIET_MINUTES_AFTER_REMINDER: int = 60
    # Where a dispatch pass reaches this API. Blank means this same process over
    # loopback, which is right whenever the pass runs inside the API — as it
    # does in production. Only set it if the API is not listening on API_PORT.
    DISPATCH_API_URL: str = ""

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        """Accept a JSON list, a comma-separated string, or an actual list."""
        if isinstance(v, str) and not v.strip().startswith("["):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("COOKIE_SAMESITE", mode="before")
    @classmethod
    def _normalise_samesite(cls, v):
        """Accept "None" or "LAX" from an env file; the cookie wants lowercase."""
        return v.strip().lower() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _samesite_none_requires_secure(self) -> "Settings":
        # Browsers reject a SameSite=None cookie that is not also Secure, so this
        # combination would silently set no cookie at all. Refuse to start with it.
        if self.COOKIE_SAMESITE == "none" and not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true.")
        return self

    @model_validator(mode="after")
    def _assemble_database_url(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @property
    def dispatch_api_url(self) -> str:
        return self.DISPATCH_API_URL or f"http://127.0.0.1:{self.API_PORT}"

    @property
    def ALGORITHM(self) -> str:
        """Backwards-compatible alias for JWT_ALGORITHM."""
        return self.JWT_ALGORITHM


settings = Settings()
