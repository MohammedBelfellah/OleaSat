# OleaSat Frontend (Next.js)

Frontend client for the OleaSat backend (`/api/v1/*`).

## Implemented Scope (Endpoint Coverage Expansion)

- Step 1: frontend-backend connectivity check with `GET /health`
- Step 2: authentication flow pages using backend auth endpoints
- Step 3: farm registration flow using authenticated backend endpoint
- Step 4: dashboard with metrics and farm insights
- Step 5: Leaflet parcel drawing and irrigation analysis views
- Step 6: farm management (`GET/DELETE /farms/*`) + Telegram deep-link
- Step 7: feedback loop screens (`POST/GET /feedback/*`)
- Step 8: direct tools for `/analyze` and `/satellite/indices`
- Step 9: admin operations (`/admin/dashboard`, `/admin/farmers`, `/admin/trigger-weekly`)

Implemented auth routes:

- `/auth/register` -> `POST /auth/register`
- `/auth/login` -> `POST /auth/login`
- `/auth/me` -> `GET /auth/me` with `Authorization: Bearer <token>`

The access token is stored in browser `localStorage`.

Implemented farm route:

- `/farms/new` -> `POST /register` (requires bearer token)
- includes interactive parcel drawing via Leaflet (click map to add polygon points)

Implemented dashboard route:

- `/dashboard` -> reads `GET /metrics/summary`, `GET /farms`, and `GET /farms/{id}`

Implemented analysis route:

- `/analysis` -> runs `POST /calculate` and `GET /farms/{id}/water-map`
- renders recommendation cards + Leaflet water-stress map with stress legend

Implemented additional routes:

- `/farms` -> `GET /farms`, `GET /farms/{id}`, `DELETE /farms/{id}`, `GET /telegram-link/{id}`
- `/feedback` -> `POST /feedback`, `GET /feedback/farmer/{id}`, `GET /metrics/farmer/{id}`
- `/tools` -> `POST /analyze`, `POST /satellite/indices`
- `/admin` -> `GET /admin/dashboard`, `GET /admin/farmers`, `POST /admin/trigger-weekly`

## Prerequisites

- Node.js 20+
- OleaSat backend running on `http://localhost:8001`

## Environment

Create a `.env.local` file in this folder:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api/v1
```

If you skip it, the app uses the same URL as fallback.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

- `src/lib/api.ts`: backend base URL + API calls
- `src/lib/auth.ts`: token persistence helpers
- `src/app/page.tsx`: health check + auth links
- `src/app/auth/register/page.tsx`: register UI
- `src/app/auth/login/page.tsx`: login UI
- `src/app/auth/me/page.tsx`: protected profile check
- `src/app/farms/new/page.tsx`: farm registration form + Leaflet parcel drawing
- `src/app/farms/page.tsx`: farms registry, details, Telegram link, delete action
- `src/app/dashboard/page.tsx`: data-driven dashboard view
- `src/app/analysis/page.tsx`: irrigation recommendation and stress-map panel
- `src/app/feedback/page.tsx`: submit/review recommendation feedback
- `src/app/tools/page.tsx`: direct analyze/satellite endpoint playground
- `src/app/admin/page.tsx`: admin dashboard + manual weekly trigger
- `src/components/maps/ParcelDrawMap.tsx`: parcel polygon drawing map
- `src/components/maps/WaterStressMap.tsx`: water-stress cell visualization map
