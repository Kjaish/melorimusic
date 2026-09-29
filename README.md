# Melori Music Platform

Melori is a full-stack music portfolio and digital storefront for independent
artists. It combines a visual discography, browser-based audio playback,
newsletter capture, protected administration, digital checkout, and an audio
metadata scanner in one workspace.

This repository is also a portfolio project demonstrating a production-minded
web application built across React, TypeScript, Express, Flask, SQLite, and
PostgreSQL-compatible persistence.

## Highlights

- Artist landing page with hero, mission, about, video, contact, and footer sections
- Album and track catalog backed by a shared TypeScript schema
- Sticky audio player with playback, seeking, volume, and track navigation
- Admin workflows for catalog management, uploads, sales, and analytics
- Session-based authentication, rate limiting, input validation, and security headers
- Optional AI-assisted search with a keyword-search fallback
- Newsletter signup and transactional email support through SMTP/Gmail integrations
- Stripe checkout and webhook handling for digital purchases
- Object-storage upload support with local development fallbacks
- Separate Flask service that extracts duration, tempo, genre, style, and energy from audio

## Architecture

```text
React + Vite client
        |
        v
Express + TypeScript API ---- SQLite or PostgreSQL
        |\
        | \-- Stripe, email, object storage, WebSocket features
        |
        \---- Flask + librosa audio analysis service
```

The main application is served by `server/index.ts` and built from the Vite
client. The Python service in `main.py` is intentionally separate because audio
analysis has different runtime dependencies and can be deployed independently.

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Framer Motion |
| API | Node.js, Express, Socket.IO, Zod |
| Data | Drizzle ORM, SQLite for local use, PostgreSQL for hosted deployments |
| Payments | Stripe Checkout and webhook handlers |
| Storage | Local uploads or object storage integrations |
| Audio analysis | Python, Flask, librosa, Mutagen, NumPy |
| Quality | Strict TypeScript checking and reproducible lockfiles |

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- Python 3.11 or newer for the audio scanner
- A database URL for database-backed features

### Install

```bash
npm install
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS/Linux
# source .venv/bin/activate
pip install -e .
```

Copy `.env.example` to `.env` and replace the placeholder values. Never commit
`.env`, production credentials, cookies, database files, or uploaded media.

### Run the web application

```bash
npm run dev
```

The Vite-powered application is available at `http://localhost:5000` by
default. Use `npm run check` for TypeScript validation and `npm run build` to
create the production bundle. Run `npm start` after building.

### Run the audio scanner

```bash
python main.py
```

The Flask scanner listens on port `8080` by default. Upload MP3, WAV, FLAC, or
OGG files at `/`; analyzed files and their metadata are available through the
queue view.

### Run both services

```bash
npm run start:both
```

## Configuration

The minimum local configuration is `DATABASE_URL` and `SESSION_SECRET`.
Optional integrations are enabled by adding their credentials:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `sqlite://...` for local development or a PostgreSQL URL |
| `SESSION_SECRET` | Secret used to sign authenticated sessions |
| `PUBLIC_BASE_URL` | Public origin used in checkout and email links |
| `ADMIN_PASSWORD` / `ADMIN_API_KEY` | Administrative access controls |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe checkout credentials |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Transactional email |
| `DEEPSEEK_API_KEY` | Optional AI search enhancement |
| `PUBLIC_OBJECT_SEARCH_PATHS` / `PRIVATE_OBJECT_DIR` | Object storage paths |

Without `DEEPSEEK_API_KEY`, search falls back to local keyword matching. Without
payment or email credentials, the core catalog and playback experience remains
usable in development.

## Project Layout

```text
client/       React application and reusable UI components
server/       Express server, API routes, auth, payments, and integrations
shared/       Shared database schema and types
main.py       Flask audio analysis service
migrations/   Database migrations
script/       Build tooling
public/       Static assets and development media
```

## Security and Operations

- Keep all environment files and production databases outside Git.
- Use a long, unique `SESSION_SECRET` in every deployed environment.
- Configure HTTPS before enabling production cookies and payments.
- Configure Stripe webhooks with `STRIPE_WEBHOOK_SECRET` before accepting payments.
- Store large audio files in object storage rather than the application filesystem.
- Back up the database and validate uploaded media at the deployment boundary.

## Verification

```bash
npm run check
npm run build
```

These commands cover the strict TypeScript surface and the production client/server
bundle. Integration credentials are intentionally not required for either check.

## License

This project is released under the MIT license. See `package.json` for the
declared package license.
