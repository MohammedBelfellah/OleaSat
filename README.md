# OleaSat

OleaSat is a smart irrigation advisory platform for olive farms.
It combines satellite indices, weather-based FAO-56 irrigation logic, and a dashboard workflow to help farmers decide when and how much to irrigate.

## Project Overview

This repository contains:

- **Backend API** (FastAPI): authentication, farm registry, irrigation analysis, water-stress maps, feedback, Telegram integration
- **Frontend Web App** (Next.js): dashboard-first interface for farm operations, analysis history, tools, and feedback
- **Architecture Design**: HTML diagrams and product flow documents

## Repository Structure

```text
OleaSat/
├─ architecture_design/        # Architecture diagrams and flow docs
├─ oleasat-backend/            # FastAPI backend
└─ oleasat-frontend/           # Next.js frontend
```

## Quick Start

### 1) Start the backend

```bash
cd oleasat-backend
cp .env.example .env
# edit .env with your keys/settings
docker compose up --build -d
```

Backend base URL:

- `http://localhost:8001/api/v1`

### 2) Start the frontend

```bash
cd oleasat-frontend
npm install
npm run dev
```

Frontend URL:

- `http://localhost:3000`

## Main Functional Areas

- User authentication (`/auth/register`, `/auth/login`)
- Dashboard workspace (`/dashboard`) with farms, profile, telegram, feedback views
- Analysis history and detail (`/dashboard/analysis`)
- Farm management and registration flow (dashboard farms view)
- Water stress map visualization with legend
- Feedback loop for recommendation quality
- Developer tools route (`/dashboard/tools`) for direct analyze/satellite calls

## API & Frontend Docs

- Backend documentation: see `oleasat-backend/README.md`
- Frontend documentation: see `oleasat-frontend/README.md`
- Architecture notes: see files inside `architecture_design/`

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, APScheduler, JWT
- **Frontend:** Next.js (App Router), TypeScript, Leaflet
- **Infra:** Docker Compose
