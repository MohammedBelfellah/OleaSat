import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.database import apply_runtime_migrations, engine
from app.models import Base
from app.routes import router

# Configure logging so bot/scheduler messages are visible
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Ensure data directory exists for SQLite
os.makedirs("data", exist_ok=True)

# Create all tables on startup
Base.metadata.create_all(bind=engine)
apply_runtime_migrations()


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup: launch Telegram bot + scheduler.  Shutdown: stop both."""
    # --- Startup ---
    from app.bot import start_bot, stop_bot
    from app.scheduler import start_scheduler, stop_scheduler

    try:
        await start_bot()
    except Exception as exc:
        logger.warning("Telegram bot failed to start: %s", exc)

    try:
        start_scheduler()
    except Exception as exc:
        logger.warning("Scheduler failed to start: %s", exc)

    yield

    # --- Shutdown ---
    stop_scheduler()
    await stop_bot()

DESCRIPTION = """
# OleaBot / OleaSat Backend API

Irrigation advisory system for Moroccan olive orchards.
Combines **real-time weather data** (Open-Meteo), **satellite vegetation indices**
(Sentinel Hub), **spatial water-stress maps**, and the **FAO-56 Penman-Monteith**
crop water model to generate personalised weekly irrigation recommendations.

## How it works

1. **Register** a farm with location, tree age, soil type, and tree count
2. **Calculate** irrigation needs — weather + satellite data fetched automatically
3. **Visualize** water stress zones via per-cell map endpoint
4. **Receive** weekly Telegram alerts in French or Darija (AI-personalized)
5. **Improve** recommendations via farmer feedback loop
6. **Monitor** via farmer and admin metrics endpoints

## Core Formula (FAO-56)

```
IR = (ET₀_week × Kc) − P_eff
litres/tree = IR × spacing_m² × soil_factor
```

- **ET₀** — Reference evapotranspiration from Open-Meteo (7-day forecast)
- **Kc** — Olive crop coefficient by season (0.65–0.70), adjusted for tree age
- **P_eff** — Effective rainfall (only rain > 5mm/day counts, at 80% efficiency)
- **Soil factor** — Sandy ×1.2 / Medium ×1.0 / Clay ×0.85
"""

TAGS_METADATA = [
    {"name": "Health", "description": "System health and connectivity checks"},
    {"name": "Auth", "description": "Authentication — register, login, JWT tokens"},
    {"name": "Farms", "description": "Farm registration, listing, and management"},
    {"name": "Irrigation", "description": "FAO-56 irrigation calculation engine"},
    {"name": "Satellite", "description": "Sentinel-2 vegetation indices (NDVI / NDMI)"},
    {"name": "Telegram", "description": "Telegram bot deep-link and notifications"},
    {"name": "Metrics", "description": "Monitoring, statistics, alert history, and feedback loop"},
    {"name": "Admin", "description": "Admin-only — dashboard insights, manage all farms, trigger jobs"},
]

app = FastAPI(
    title="OleaBot API",
    version="1.3.0",
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    contact={"name": "OleaBot Team"},
    license_info={"name": "Confidential — Hackathon MVP"},
    lifespan=lifespan,
)

# CORS — allow the frontend dev server and production origin
from fastapi.middleware.cors import CORSMiddleware

cors_origins = [origin for origin in settings.cors_allowed_origins if origin != "*"]
if not cors_origins:
    cors_origins = ["http://localhost:3000", "http://localhost:5173"]
if "*" in settings.cors_allowed_origins:
    logger.warning("Ignoring wildcard '*' in CORS_ALLOWED_ORIGINS because allow_credentials=True")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
