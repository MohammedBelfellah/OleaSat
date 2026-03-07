# 🫒 OleaBot — Irrigation Advisory Backend

> Smart irrigation advisory system for Moroccan olive orchards.  
> Combines **FAO-56 Penman-Monteith** crop water model, **Open-Meteo** weather data,
> **Sentinel Hub** satellite imagery, **JWT authentication**, and a **Telegram bot**
> to generate personalised weekly irrigation recommendations.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start (Docker)](#quick-start-docker)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
  - [Interactive Docs (Swagger)](#interactive-docs)
  - [Authentication Flow](#authentication-flow)
  - [Health](#1-health-check)
  - [Auth Register](#2-auth-register)
  - [Auth Login](#3-auth-login)
  - [Auth Me](#4-auth-me)
  - [Register Farm](#5-register-farm)
  - [Calculate Irrigation](#6-calculate-irrigation)
  - [Analyze (Direct)](#7-analyze-direct)
  - [Satellite Indices](#8-satellite-indices)
  - [Telegram Deep-Link](#9-telegram-deep-link)
  - [Metrics Summary](#10-metrics-summary)
  - [Metrics Farmer History](#11-metrics-farmer-history)
  - [Admin Trigger Weekly](#12-admin-trigger-weekly)
- [FAO-56 Engine](#fao-56-engine)
- [Telegram Bot](#telegram-bot)
- [Scheduler](#scheduler)
- [Project Structure](#project-structure)
- [Data Model](#data-model)
- [Frontend Integration Guide](#frontend-integration-guide)

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   OleaSat Backend                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Web App (React/Vue)          Telegram                  │
│       │                            │                     │
│       ▼                            ▼                     │
│   ┌──────────────────┐    ┌────────────────┐             │
│   │  FastAPI + JWT   │    │  Telegram Bot  │             │
│   │  /api/v1/*       │    │  /start /help  │             │
│   │  routes.py       │    │  bot.py        │             │
│   └───────┬──────────┘    └───────┬────────┘             │
│           │                       │                      │
│   ┌───────┴───────────────────────┴──────────┐           │
│   │              services.py                  │          │
│   │  ┌──────────┐ ┌──────────┐ ┌───────────┐ │          │
│   │  │Sentinel  │ │Open-Meteo│ │  FAO-56   │ │          │
│   │  │Hub API   │ │Weather   │ │  Engine   │ │          │
│   │  │NDVI/NDMI │ │ET₀+Rain  │ │  IR/L     │ │          │
│   │  └──────────┘ └──────────┘ └───────────┘ │          │
│   └───────┬──────────────────────────────────┘           │
│           │                                              │
│   ┌───────┴────────┐    ┌──────────────────┐             │
│   │  SQLite DB     │    │  APScheduler     │             │
│   │  (SQLAlchemy)  │    │  Sunday 07:00    │             │
│   │  User          │    │  scheduler.py    │             │
│   │  FarmerProfile │    └──────────────────┘             │
│   │  AlertRecord   │                                     │
│   └────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
```

---

## Quick Start (Docker)

```bash
# 1. Clone and enter the backend directory
cd oleasat-backend

# 2. Create your environment file
cp .env.example .env
# Edit .env with your credentials

# 3. Build and run
docker compose up --build -d

# 4. Verify
curl http://localhost:8001/api/v1/health
# → {"status":"ok","db":"ok"}
```

**Base URL:** `http://localhost:8001/api/v1`

---

## Environment Variables

| Variable              | Required | Default                                  | Description                        |
| --------------------- | -------- | ---------------------------------------- | ---------------------------------- |
| `JWT_SECRET_KEY`      | **Yes**  | `change-me-in-production`                | 256-bit hex key for signing JWTs   |
| `JWT_EXPIRE_MINUTES`  | No       | `1440` (24h)                             | Token expiry in minutes            |
| `DATABASE_URL`        | No       | `sqlite:///./data/oleasat.db`            | SQLAlchemy database URL            |
| `TELEGRAM_BOT_TOKEN`  | No\*     | —                                        | Telegram bot token from @BotFather |
| `OPEN_METEO_BASE_URL` | No       | `https://api.open-meteo.com/v1/forecast` | Weather API base URL               |
| `SH_CLIENT_ID`        | No\*\*   | —                                        | Sentinel Hub OAuth2 client ID      |
| `SH_CLIENT_SECRET`    | No\*\*   | —                                        | Sentinel Hub OAuth2 secret         |
| `SH_BASE_URL`         | No       | `https://services.sentinel-hub.com`      | Sentinel Hub API base              |
| `SH_TOKEN_URL`        | No       | (auto)                                   | Sentinel Hub token endpoint        |

> \*If `TELEGRAM_BOT_TOKEN` is not set, the bot and scheduler start silently — the API works without Telegram.  
> \*\*If Sentinel Hub credentials are not set, satellite endpoints return deterministic mock values (`source: "mock"`).

---

## API Documentation

### Interactive Docs

FastAPI auto-generates interactive documentation:

| Format         | URL                                                        |
| -------------- | ---------------------------------------------------------- |
| **Swagger UI** | [http://localhost:8001/docs](http://localhost:8001/docs)   |
| **ReDoc**      | [http://localhost:8001/redoc](http://localhost:8001/redoc) |

---

### Authentication Flow

```
1. POST /api/v1/auth/register   →  { access_token, user_id, ... }
   or
   POST /api/v1/auth/login      →  { access_token, user_id, ... }

2. All subsequent requests include:
   Authorization: Bearer <access_token>

3. Token expires after 24 hours → login again
```

**Public endpoints (no token required):**

- `GET  /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

**Protected endpoints (Bearer token required):**

- Everything else

---

### 1. Health Check

|            |                  |
| ---------- | ---------------- |
| **Method** | `GET`            |
| **Path**   | `/api/v1/health` |
| **Auth**   | None             |

**Response 200:**

```json
{
  "status": "ok",
  "db": "ok"
}
```

---

### 2. Auth Register

|            |                         |
| ---------- | ----------------------- |
| **Method** | `POST`                  |
| **Path**   | `/api/v1/auth/register` |
| **Auth**   | None                    |

Create a new web-app user account. Returns a JWT so the frontend can immediately make authenticated requests.

**Request body:**

```json
{
  "email": "admin@oleasat.ma",
  "password": "OleaSat2026!",
  "full_name": "Admin OleaSat"
}
```

| Field       | Type   | Required | Description                |
| ----------- | ------ | -------- | -------------------------- |
| `email`     | string | Yes      | Unique email (min 5 chars) |
| `password`  | string | Yes      | Plain text, min 6 chars    |
| `full_name` | string | No       | Display name               |

**Response 201:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user_id": "7f48a7ce-053d-4b4d-87b8-6ffd70b6fa15",
  "email": "admin@oleasat.ma",
  "full_name": "Admin OleaSat",
  "role": "OPERATOR"
}
```

| Error                      | Code | When                 |
| -------------------------- | ---- | -------------------- |
| `email_already_registered` | 409  | Email already in use |

---

### 3. Auth Login

|            |                      |
| ---------- | -------------------- |
| **Method** | `POST`               |
| **Path**   | `/api/v1/auth/login` |
| **Auth**   | None                 |

**Request body:**

```json
{
  "email": "admin@oleasat.ma",
  "password": "OleaSat2026!"
}
```

**Response 200:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user_id": "7f48a7ce-053d-4b4d-87b8-6ffd70b6fa15",
  "email": "admin@oleasat.ma",
  "full_name": "Admin OleaSat",
  "role": "OPERATOR"
}
```

| Error                 | Code | When                 |
| --------------------- | ---- | -------------------- |
| `invalid_credentials` | 401  | Wrong email/password |
| `account_deactivated` | 403  | Account disabled     |

---

### 4. Auth Me

|            |                   |
| ---------- | ----------------- |
| **Method** | `GET`             |
| **Path**   | `/api/v1/auth/me` |
| **Auth**   | Bearer token      |

Returns the authenticated user's profile.

**Response 200:**

```json
{
  "id": "7f48a7ce-053d-4b4d-87b8-6ffd70b6fa15",
  "email": "admin@oleasat.ma",
  "full_name": "Admin OleaSat",
  "role": "OPERATOR",
  "is_active": true,
  "created_at": "2026-03-07T01:04:16.079200"
}
```

---

### 5. Register Farm

|            |                    |
| ---------- | ------------------ |
| **Method** | `POST`             |
| **Path**   | `/api/v1/register` |
| **Auth**   | Bearer token       |

**Request body:**

```json
{
  "farmer_name": "Ahmed",
  "phone": "0612345678",
  "tree_age": "ADULT",
  "soil_type": "MEDIUM",
  "tree_count": 120,
  "spacing_m2": 100.0,
  "polygon": [
    [-5.55, 33.89],
    [-5.54, 33.89],
    [-5.54, 33.88],
    [-5.55, 33.88]
  ]
}
```

| Field         | Type    | Default    | Description                            |
| ------------- | ------- | ---------- | -------------------------------------- |
| `farmer_name` | string  | _required_ | Min 2 characters                       |
| `phone`       | string  | _required_ | Min 6 characters                       |
| `crop_type`   | string  | `"olive"`  | Crop type                              |
| `tree_age`    | enum    | `"ADULT"`  | `YOUNG` (< 5 years) or `ADULT`         |
| `soil_type`   | enum    | `"MEDIUM"` | `SANDY`, `MEDIUM`, or `CLAY`           |
| `tree_count`  | integer | `100`      | Number of trees (≥ 1)                  |
| `spacing_m2`  | float   | `100.0`    | Surface area per tree in m²            |
| `polygon`     | array   | _required_ | List of `[longitude, latitude]` points |

**Response 201:**

```json
{
  "farm_id": "36201fe0-4deb-4809-bdab-01b47593e4be",
  "message": "Farm registered successfully"
}
```

> ⚠️ **Save the `farm_id`** — you need it for `/calculate`, `/telegram-link/{id}`, and `/metrics/farmer/{id}`.

---

### 6. Calculate Irrigation

|            |                     |
| ---------- | ------------------- |
| **Method** | `POST`              |
| **Path**   | `/api/v1/calculate` |
| **Auth**   | Bearer token        |

**Request body:**

```json
{
  "farmer_id": "36201fe0-4deb-4809-bdab-01b47593e4be"
}
```

The system:

1. Looks up the farmer's profile from the database
2. Fetches NDVI/NDMI from Sentinel Hub
3. Fetches 7-day weather forecast from Open-Meteo
4. Runs the FAO-56 calculation
5. Logs an AlertRecord in the database

**Response 200:**

```json
{
  "farm_id": "36201fe0-4deb-4809-bdab-01b47593e4be",
  "ndvi_current": 0.5667,
  "ndvi_delta": -0.0054,
  "ndmi_current": 0.1674,
  "cloud_pct": 20.0,
  "date_used": "2026-02-21",
  "images_used": 2,
  "source": "sentinel_hub",
  "note": null,
  "window_start": "2026-02-04",
  "window_end": "2026-03-06",
  "et0_week": 14.14,
  "rain_week": 29.6,
  "p_eff": 23.52,
  "kc_applied": 0.7,
  "ir_mm": 0.0,
  "phase_label": "Floraison",
  "is_critical_phase": true,
  "soil_factor": 1.0,
  "litres_per_tree": 0.0,
  "total_litres": 0.0,
  "total_m3": 0.0,
  "stress_mode": false,
  "survival_litres": null,
  "recommendation": "SKIP",
  "explanation": "NDVI=0.5667 (Δ-0.0054), NDMI=0.1674. Phase: Floraison ..."
}
```

| Error                | Code | When                                      |
| -------------------- | ---- | ----------------------------------------- |
| `farmer_not_found`   | 404  | Unknown farmer_id                         |
| `incomplete_profile` | 422  | Missing polygon, age, soil, or tree_count |

---

### 7. Analyze (Direct)

|            |                   |
| ---------- | ----------------- |
| **Method** | `POST`            |
| **Path**   | `/api/v1/analyze` |
| **Auth**   | Bearer token      |

Same pipeline as `/calculate` but you pass all parameters directly — no database lookup or persistence.

**Request body:**

```json
{
  "farm_id": "test-farm",
  "polygon": [
    [-5.55, 33.89],
    [-5.54, 33.89],
    [-5.54, 33.88],
    [-5.55, 33.88]
  ],
  "tree_count": 120,
  "tree_age": "ADULT",
  "soil_type": "MEDIUM",
  "spacing_m2": 100.0,
  "start_date": "2026-02-01",
  "end_date": "2026-03-06",
  "max_cloud_pct": 20
}
```

| Field           | Type    | Default     | Description               |
| --------------- | ------- | ----------- | ------------------------- |
| `farm_id`       | string  | _required_  | Any identifier            |
| `polygon`       | array   | _required_  | `[lon, lat]` points       |
| `tree_count`    | integer | `100`       | Number of trees           |
| `tree_age`      | enum    | `"ADULT"`   | `YOUNG` or `ADULT`        |
| `soil_type`     | enum    | `"MEDIUM"`  | `SANDY`, `MEDIUM`, `CLAY` |
| `spacing_m2`    | float   | `100.0`     | m² per tree               |
| `start_date`    | string  | 30 days ago | `YYYY-MM-DD`              |
| `end_date`      | string  | today       | `YYYY-MM-DD`              |
| `max_cloud_pct` | float   | `20`        | Max cloud cover % (0–100) |

**Response 200:** Same structure as `/calculate`.

---

### 8. Satellite Indices

|            |                             |
| ---------- | --------------------------- |
| **Method** | `POST`                      |
| **Path**   | `/api/v1/satellite/indices` |
| **Auth**   | Bearer token                |

Returns NDVI and NDMI vegetation indices without running the FAO-56 engine.

**Request body:**

```json
{
  "polygon": [
    [-5.55, 33.89],
    [-5.54, 33.89],
    [-5.54, 33.88],
    [-5.55, 33.88]
  ],
  "max_cloud_pct": 20
}
```

**Response 200:**

```json
{
  "ndvi_current": 0.5667,
  "ndvi_delta": -0.0054,
  "ndmi_current": 0.1674,
  "cloud_pct": 20.0,
  "date_used": "2026-02-21",
  "images_used": 2,
  "source": "sentinel_hub",
  "note": null,
  "window_start": "2026-02-04",
  "window_end": "2026-03-06"
}
```

---

### 9. Telegram Deep-Link

|            |                                     |
| ---------- | ----------------------------------- |
| **Method** | `GET`                               |
| **Path**   | `/api/v1/telegram-link/{farmer_id}` |
| **Auth**   | Bearer token                        |

Generates a Telegram deep-link URL for a farmer. The frontend displays this as a button or QR code.

**Response 200:**

```json
{
  "farmer_id": "36201fe0-4deb-4809-bdab-01b47593e4be",
  "telegram_link": "https://t.me/OleaSat_bot?start=36201fe0-4deb-4809-bdab-01b47593e4be",
  "linked": false
}
```

| Field           | Description                                         |
| --------------- | --------------------------------------------------- |
| `telegram_link` | URL the farmer opens to link their Telegram account |
| `linked`        | `true` if the farmer already has Telegram connected |

| Error              | Code | When            |
| ------------------ | ---- | --------------- |
| `farmer_not_found` | 404  | Unknown farm_id |

---

### 10. Metrics Summary

|            |                           |
| ---------- | ------------------------- |
| **Method** | `GET`                     |
| **Path**   | `/api/v1/metrics/summary` |
| **Auth**   | Bearer token              |

**Response 200:**

```json
{
  "farmers_active": 3,
  "alerts_sent_this_week": 2,
  "avg_litres_per_tree": 27.2
}
```

---

### 11. Metrics Farmer History

|            |                                      |
| ---------- | ------------------------------------ |
| **Method** | `GET`                                |
| **Path**   | `/api/v1/metrics/farmer/{farmer_id}` |
| **Auth**   | Bearer token                         |

**Response 200:**

```json
{
  "farmer": {
    "id": "36201fe0-4deb-4809-bdab-01b47593e4be",
    "state": "ACTIVE",
    "latitude": 33.885,
    "longitude": -5.545,
    "tree_age": "ADULT",
    "soil_type": "MEDIUM",
    "tree_count": 120,
    "spacing_m2": 100.0,
    "created_at": "2026-03-06T23:18:16.100171",
    "last_alert_at": "2026-03-06T23:18:31.402112"
  },
  "alerts": [
    {
      "id": "06de5238-7bfa-4759-bab9-a3e641c3e1bc",
      "sent_at": "2026-03-06T23:18:31.423570",
      "et0_weekly_mm": 14.14,
      "rain_weekly_mm": 29.6,
      "kc_applied": 0.7,
      "litres_per_tree": 0.0,
      "total_litres": 0.0,
      "stress_mode": false,
      "delivery_status": "SENT"
    }
  ]
}
```

---

### 12. Admin Trigger Weekly

|            |                                |
| ---------- | ------------------------------ |
| **Method** | `POST`                         |
| **Path**   | `/api/v1/admin/trigger-weekly` |
| **Auth**   | Bearer token                   |

Manually triggers the weekly irrigation job for all active farmers with linked Telegram accounts. Useful for testing and demos.

**Response 200:**

```json
{
  "status": "ok",
  "message": "Manual weekly job completed"
}
```

---

## FAO-56 Engine

### Core Formula

```
IR = (ET₀_week × Kc_adj) − P_eff
litres_per_tree = IR_mm × spacing_m² × soil_factor
total_litres = litres_per_tree × tree_count
```

### Kc Lookup Table (Olive, Morocco)

| Months    | Phase           | Base Kc | Adult | Young (×0.85) |
| --------- | --------------- | ------- | ----- | ------------- |
| Nov – Feb | Repos végétatif | 0.65    | 0.65  | 0.55          |
| Mar – May | Floraison ⚠️    | 0.70    | 0.70  | 0.60          |
| Jun – Aug | Dév. du fruit   | 0.65    | 0.65  | 0.55          |
| Sep – Oct | Accum. huile ⚠️ | 0.70    | 0.70  | 0.60          |

### Soil Factor

| Soil Type | Factor | Rationale                          |
| --------- | ------ | ---------------------------------- |
| SANDY     | ×1.20  | Fast drainage → more water needed  |
| MEDIUM    | ×1.00  | Reference (limon)                  |
| CLAY      | ×0.85  | High retention → less water needed |

### Effective Rainfall

```
for each day:
  if rain > 5mm → P_eff += rain × 0.8
  else          → P_eff += 0  (too small to reach roots)
```

### Stress Mode

Triggered when `ET₀_week > 45mm` AND `P_eff < 2mm`.  
Sets `survival_litres = litres_per_tree × 0.35` (minimum to protect flowers/fruit).

### Recommendation Codes

| Code       | Condition                                  |
| ---------- | ------------------------------------------ |
| `URGENT`   | stress_mode = true OR litres_per_tree ≥ 25 |
| `IRRIGATE` | litres_per_tree ≥ 10                       |
| `SKIP`     | litres_per_tree < 10                       |

---

## Telegram Bot

**Bot:** [@OleaSat_bot](https://t.me/OleaSat_bot)

The bot is **notification-only** — farmers register via the web app, then link their Telegram to receive weekly alerts.

### Flow

```
1. Farmer registers via web app        →  POST /register → farm_id
2. Frontend fetches deep-link           →  GET /telegram-link/{farm_id}
3. Farmer clicks t.me/OleaSat_bot?start={farm_id}
4. Bot receives /start {farm_id}        →  saves telegram_chat_id in DB
5. Every Sunday 07:00                   →  scheduler runs pipeline + sends alert
```

### Bot Commands

| Command   | Description                           |
| --------- | ------------------------------------- |
| `/start`  | Link Telegram to farmer profile       |
| `/help`   | Show available commands               |
| `/status` | Show the most recent irrigation alert |

### Alert Message Example (French)

```
🔴 Alerte Irrigation Hebdomadaire

Bonjour Ahmed,

📊 Statut : URGENT — Irrigation requise

📋 Détails du calcul :
  • Phase : Floraison (Kc=0.7)
  • ET₀ semaine : 48.5 mm
  • Pluie semaine : 0.0 mm
  • Pluie efficace : 0.0 mm
  • NDVI : 0.52

💧 Recommandation :
  • Par arbre : 3395.0 L
  • Total parcelle : 407400.0 L (407.4 m³)

⚠️ Mode sécheresse activé!
Irrigation de survie minimale : 1188.25 L/arbre
```

---

## Scheduler

**Engine:** APScheduler (AsyncIOScheduler)  
**Schedule:** Every Sunday at 07:00 Africa/Casablanca timezone

### What it does each run:

1. Query all `ACTIVE` farmers with `telegram_chat_id` set
2. For each farmer: run the FAO-56 pipeline (weather + satellite + calculation)
3. Build a French alert message using templates
4. Send via Telegram bot
5. Log an `AlertRecord` with `delivery_status = SENT | FAILED`

### Manual Trigger

```bash
curl -X POST http://localhost:8001/api/v1/admin/trigger-weekly \
  -H "Authorization: Bearer <token>"
```

---

## Project Structure

```
oleasat-backend/
├── docker-compose.yml        # Docker services + data volume
├── Dockerfile                # Python 3.11-slim image
├── requirements.txt          # 13 Python dependencies
├── .env                      # Environment variables (not in git)
├── .env.example              # Template for .env
└── app/
    ├── main.py               # FastAPI app + CORS + lifespan (bot + scheduler)
    ├── config.py             # Settings from environment variables
    ├── auth.py               # JWT + bcrypt + get_current_user dependency
    ├── routes.py             # 12 API endpoints with auth protection
    ├── services.py           # Business logic (Satellite + Weather + FAO-56)
    ├── schemas.py            # Pydantic request/response models
    ├── models.py             # SQLAlchemy ORM (User + FarmerProfile + AlertRecord)
    ├── database.py           # DB engine + session factory
    ├── bot.py                # Telegram bot (deep-link + /help + /status)
    ├── templates.py          # Telegram message templates (French)
    └── scheduler.py          # APScheduler weekly irrigation job
```

---

## Data Model

### User

| Column            | Type            | Description              |
| ----------------- | --------------- | ------------------------ |
| `id`              | UUID PK         | Internal identifier      |
| `email`           | string (unique) | Login email              |
| `hashed_password` | string          | bcrypt hash              |
| `full_name`       | string          | Display name             |
| `role`            | enum            | `ADMIN` or `OPERATOR`    |
| `is_active`       | boolean         | Account enabled/disabled |
| `created_at`      | timestamp       | Registration date        |

### FarmerProfile

| Column                   | Type            | Description                            |
| ------------------------ | --------------- | -------------------------------------- |
| `id`                     | UUID PK         | Internal identifier                    |
| `telegram_chat_id`       | string (unique) | Telegram chat ID (set via deep-link)   |
| `state`                  | enum            | FSM state: UNREGISTERED → ... → ACTIVE |
| `latitude` / `longitude` | float           | Parcel centroid                        |
| `polygon_json`           | text            | GeoJSON polygon coordinates            |
| `tree_age`               | enum            | YOUNG / ADULT                          |
| `soil_type`              | enum            | SANDY / MEDIUM / CLAY                  |
| `tree_count`             | integer         | Number of olive trees                  |
| `spacing_m2`             | float           | Surface area per tree                  |
| `farmer_name`            | string          | Farmer's name                          |
| `phone`                  | string          | Phone number                           |
| `language`               | enum            | FR / AR (default: FR)                  |
| `created_at`             | timestamp       | Registration date                      |
| `last_alert_at`          | timestamp       | Last alert sent                        |
| `alert_failed`           | boolean         | True if last dispatch failed           |

### AlertRecord (append-only)

| Column            | Type      | Description                        |
| ----------------- | --------- | ---------------------------------- |
| `id`              | UUID PK   | Internal identifier                |
| `farmer_id`       | UUID FK   | References FarmerProfile           |
| `sent_at`         | timestamp | When the alert was created         |
| `et0_weekly_mm`   | float     | ET₀ sum used in calculation        |
| `rain_weekly_mm`  | float     | Total rainfall                     |
| `kc_applied`      | float     | Final Kc after adjustments         |
| `litres_per_tree` | float     | Recommended litres per tree        |
| `total_litres`    | float     | Total recommended volume           |
| `stress_mode`     | boolean   | Whether drought mode was triggered |
| `delivery_status` | enum      | SENT / FAILED / RETRIED            |

---

## Frontend Integration Guide

### 1. Setup Axios / Fetch

```javascript
const API_BASE = "http://localhost:8001/api/v1";

// After login, store the token
localStorage.setItem("token", response.access_token);

// Include in all requests
const headers = {
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
};
```

### 2. Auth Flow

```javascript
// Register
const res = await fetch(`${API_BASE}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, full_name }),
});
const { access_token, user_id } = await res.json();

// Login
const res = await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { access_token } = await res.json();

// Check current user
const res = await fetch(`${API_BASE}/auth/me`, { headers });
```

### 3. Farm Registration

```javascript
const res = await fetch(`${API_BASE}/register`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    farmer_name: "Ahmed",
    phone: "0612345678",
    polygon: [
      [-5.55, 33.89],
      [-5.54, 33.89],
      [-5.54, 33.88],
      [-5.55, 33.88],
    ],
    tree_age: "ADULT",
    soil_type: "MEDIUM",
    tree_count: 120,
  }),
});
const { farm_id } = await res.json();
```

### 4. Calculate + Display

```javascript
const res = await fetch(`${API_BASE}/calculate`, {
  method: "POST",
  headers,
  body: JSON.stringify({ farmer_id: farm_id }),
});
const data = await res.json();
// data.recommendation → "SKIP" | "IRRIGATE" | "URGENT"
// data.litres_per_tree, data.total_litres, data.stress_mode, etc.
```

### 5. Telegram Link

```javascript
const res = await fetch(`${API_BASE}/telegram-link/${farm_id}`, { headers });
const { telegram_link, linked } = await res.json();
// Show telegram_link as a button or QR code
// linked === true → already connected
```

### 6. Dashboard Metrics

```javascript
// Summary stats
const summary = await fetch(`${API_BASE}/metrics/summary`, { headers }).then(
  (r) => r.json(),
);
// summary.farmers_active, summary.alerts_sent_this_week, summary.avg_litres_per_tree

// Farmer detail + alert history
const detail = await fetch(`${API_BASE}/metrics/farmer/${farm_id}`, {
  headers,
}).then((r) => r.json());
// detail.farmer, detail.alerts[]
```

### 7. Error Handling

```javascript
// 401 → token expired or invalid → redirect to login
// 404 → farmer_not_found
// 409 → email_already_registered
// 422 → validation error (check response body for details)
```

### CORS

CORS is enabled for `localhost:3000` and `localhost:5173` (React/Vite dev servers). No proxy needed during development.
