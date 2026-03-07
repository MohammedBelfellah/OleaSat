# OleaSat Frontend (Next.js)

Frontend client for the OleaSat backend (`/api/v1/*`).

## Step 1 Scope

This first step only does one thing:

- verify frontend to backend connectivity with `GET /health`

No auth pages or dashboard screens are implemented yet.

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
- `src/app/page.tsx`: step-1 health check screen

## Next Incremental Step

Build auth flow pages against:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
