from pydantic_settings import BaseSettings, SettingsConfigDict


class TelegramSettings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    # Validated against the X-Telegram-Bot-Api-Secret-Token header on every update.
    TELEGRAM_WEBHOOK_SECRET: str = ""
    # Blank => run in long-polling mode (local dev only, per TRD Section 6.3).
    TELEGRAM_WEBHOOK_URL: str = ""
    WEBHOOK_LISTEN_HOST: str = "0.0.0.0"
    WEBHOOK_LISTEN_PORT: int = 8080

    BACKEND_API_URL: str = "http://backend:8000"
    INTERNAL_API_KEY: str = "dev_internal_key_only"

    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def webhook_mode(self) -> bool:
        return bool(self.TELEGRAM_WEBHOOK_URL)


settings = TelegramSettings()
