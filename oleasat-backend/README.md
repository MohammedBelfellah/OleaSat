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
- `POST /api/v1/satellite/indices`

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

## Sentinel Hub (satellite data)

The backend uses the **sentinelhub-py** Python package to query the **Sentinel Hub Statistical API** (Copernicus Data Space Ecosystem). It fetches Sentinel-2 L2A imagery and computes NDVI / NDMI statistics over a farm polygon. OAuth2 authentication is handled automatically by the package.

If Sentinel Hub credentials are configured, `POST /api/v1/satellite/indices` and `POST /api/v1/analyze` will query real satellite data.
If not configured, the API returns deterministic mock values (`source = mock`) so development can continue.

Environment variables:

- `SH_CLIENT_ID` – OAuth2 client ID from Copernicus Data Space
- `SH_CLIENT_SECRET` – OAuth2 client secret
- `SH_BASE_URL` (default: `https://sh.dataspace.copernicus.eu`)
- `SH_TOKEN_URL` (default: CDSE token endpoint)
