from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # --- API --------------------------------------------------------------
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    # Turned off in the test suite so auth tests aren't throttled.
    RATE_LIMIT_ENABLED: bool = True
    # Shared secret the telegram/scheduler containers use to reach /internal/*.
    INTERNAL_API_KEY: str = "dev_internal_key_only"

    # --- Telegram ---------------------------------------------------------
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""
    TELEGRAM_LINK_CODE_TTL_MINUTES: int = 15

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        """Accept either a JSON list or a plain comma-separated string in .env."""
        if isinstance(v, str) and not v.strip().startswith("["):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def _assemble_database_url(self) -> "Settings":
        if not self.DATABASE_URL:
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    @property
    def ALGORITHM(self) -> str:
        """Backwards-compatible alias for JWT_ALGORITHM."""
        return self.JWT_ALGORITHM


settings = Settings()
