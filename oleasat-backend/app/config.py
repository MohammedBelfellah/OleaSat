import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    app_name: str = os.getenv("APP_NAME", "OleaSat Backend")
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/oleasat.db")
    open_meteo_base_url: str = os.getenv("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast")
    sh_client_id: str | None = os.getenv("SH_CLIENT_ID")
    sh_client_secret: str | None = os.getenv("SH_CLIENT_SECRET")
    sh_base_url: str = os.getenv("SH_BASE_URL", "https://services.sentinel-hub.com")
    sh_token_url: str = os.getenv("SH_TOKEN_URL", "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token")
    telegram_bot_token: str | None = os.getenv("TELEGRAM_BOT_TOKEN")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    jwt_expire_minutes: str = os.getenv("JWT_EXPIRE_MINUTES", "1440")


settings = Settings()
