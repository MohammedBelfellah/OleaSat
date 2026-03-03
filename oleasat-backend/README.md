# OleaSat Backend (Minimal Start)

Simple FastAPI backend starter for OleaSat.

## Structure

- `app/main.py` FastAPI app entry
- `app/routes.py` API endpoints
- `app/services.py` Pipeline logic stubs
- `app/schemas.py` Request/response schemas
- `app/config.py` Environment settings

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/register`
- `POST /api/v1/analyze`

## Run locally

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open: `http://localhost:8000/docs`

## Run with Docker

```bash
cp .env.example .env
docker compose up --build
```

Open: `http://localhost:8000/docs`
