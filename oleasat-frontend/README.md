# OleaSat Frontend (Next.js)

Frontend client for the OleaSat backend (`/api/v1/*`).

## Implemented Scope (Step 1 + Step 2)

- Step 1: frontend-backend connectivity check with `GET /health`
- Step 2: authentication flow pages using backend auth endpoints

Implemented auth routes:

- `/auth/register` -> `POST /auth/register`
- `/auth/login` -> `POST /auth/login`
- `/auth/me` -> `GET /auth/me` with `Authorization: Bearer <token>`

The access token is stored in browser `localStorage`.

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

## Next Incremental Step

Build farm registration flow against:

- `POST /register`
