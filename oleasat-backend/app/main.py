import os

from fastapi import FastAPI

from app.database import engine
from app.models import Base
from app.routes import router

# Ensure data directory exists for SQLite
os.makedirs("data", exist_ok=True)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

DESCRIPTION = """
# OleaBot / OleaSat Backend API

Irrigation advisory system for Moroccan olive orchards.
Combines **real-time weather data** (Open-Meteo), **satellite vegetation indices**
(Sentinel Hub), and the **FAO-56 Penman-Monteith** crop water model to generate
personalised weekly irrigation recommendations.

## How it works

1. **Register** a farm with location, tree age, soil type, and tree count
2. **Calculate** irrigation needs — the system fetches weather + satellite data automatically
3. **Monitor** via metrics endpoints for dashboards

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
    {"name": "Farms", "description": "Farm registration and profile management"},
    {"name": "Irrigation", "description": "FAO-56 irrigation calculation engine"},
    {"name": "Satellite", "description": "Sentinel-2 vegetation indices (NDVI / NDMI)"},
    {"name": "Metrics", "description": "Monitoring, statistics, and alert history"},
]

app = FastAPI(
    title="OleaBot API",
    version="1.0.0",
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    contact={"name": "OleaBot Team"},
    license_info={"name": "Confidential — Hackathon MVP"},
)
app.include_router(router, prefix="/api/v1")
