
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SchedulerSettings(BaseSettings):
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "smart_habit_tracker"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    # APScheduler's SQLAlchemyJobStore is synchronous, so it needs a psycopg2 URL
    # rather than the asyncpg one the backend uses.
    JOBSTORE_URL: str | None = None

    BACKEND_API_URL: str = "http://backend:8000"
    INTERNAL_API_KEY: str = "dev_internal_key_only"
    # The Bot API is stateless HTTP, so the dispatch job sends reminders itself
    # rather than routing through the bot container.
    TELEGRAM_BOT_TOKEN: str = ""

    # How often the dispatch loop scans for upcoming free slots.
    DISPATCH_INTERVAL_SECONDS: int = 300
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _assemble_jobstore_url(self) -> "SchedulerSettings":
        if not self.JOBSTORE_URL:
            self.JOBSTORE_URL = (
                f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self


settings = SchedulerSettings()
