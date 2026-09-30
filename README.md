# MineGov AI

**Smart Governance & Compliance Monitoring for Coal Mines**

MineGov AI is a full-stack enterprise MVP for the coal-mine governance workflow:

> **Mine → Compliance → Inspection → Violation → Corrective Action → Evidence → Verification → Risk Score → Dashboard → AI Summary**

The application includes a responsive React dashboard, role-based access, REST API, Firebase Cloud Firestore collections, evidence uploads, a deterministic explainable risk engine, automatic alerting, CSV reporting, an optional AI provider layer and seeded demonstration records.

## Quick start

Requirements: Node.js 20+, npm 10+. Firebase Cloud Firestore is supported for cloud persistence; for a zero-configuration local preview the API uses a persistent JSON development store when Firebase credentials are not set.

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The development server proxies `/api` to the Express API on port 4000. On the first run it seeds clearly marked **DEMO DATA** and creates the demo accounts below.

### Demo accounts (development only)

Shared password: `MineGov2026!`

| Email | Role |
| --- | --- |
| `admin@example.com` | ADMIN |
| `officer@example.com` | MINE_OFFICER |
| `inspector@example.com` | INSPECTOR |
| `manager@example.com` | MANAGEMENT |

The login screen labels these as development demo accounts. Password hashes are stored in the backend. Demo account seeding and credentials should not be enabled for a public production deployment.

## Firebase Cloud Firestore development

To connect to Firebase Cloud Firestore, copy `.env.example` to `.env` and configure your Firebase Service Account credentials using any of the supported options:

1. **Individual environment variables**:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
2. **Service Account JSON file path or inline JSON**:
   ```env
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   # or FIREBASE_SERVICE_ACCOUNT_JSON={...}
   ```
3. **Local Firestore Emulator** (via Docker Compose or Firebase CLI):
   ```bash
   docker compose up -d firestore-emulator
   cp .env.example .env
   # Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and FIREBASE_PROJECT_ID=minegov-ai
   npm run dev
   ```

If Firebase is intentionally absent in development, the API persists writes to `server/data/store.json` (ignored by Git). In production, Firebase Firestore credentials and a `JWT_SECRET` are required; the server will not silently fall back to JSON persistence.

To seed an empty database explicitly:

```bash
npm run seed
```

For a local JSON-store or Firestore Emulator demo reset, stop the API and run `npm run seed -- --force`. The force option is intentionally refused for cloud Firestore projects so an operational database cannot be wiped accidentally. The seed script creates 5 mines, 10 users, 30 compliance records, 20 inspections, 25 violations, 20 corrective actions and 20 initial alerts. It also creates a clearly marked sample evidence file; it is not a real statutory record. Risk-related alerts may also be generated from the seeded records.

## Environment variables

See `.env.example` for the complete template.

### Frontend

- `VITE_API_URL` — optional API origin; leave blank to use the same-origin Vite `/api` proxy.

### Backend

- `PORT` — Express port (default `4000`)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — Firebase Admin SDK service account credentials
- `FIREBASE_SERVICE_ACCOUNT_PATH` / `FIREBASE_SERVICE_ACCOUNT_JSON` — alternative service account file path or inline JSON/base64
- `FIRESTORE_EMULATOR_HOST` — optional local Firestore emulator host (`127.0.0.1:8080`)
- `JWT_SECRET` — signing secret; required in production
- `CORS_ORIGIN` — comma-separated allowed origins for production
- `AI_PROVIDER` — `auto`, `gemini`, `openai`, or `openai-compatible`
- `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` — optional server-only model settings
- `SEED_DEMO_DATA=true` — explicitly permit demo seeding at production startup; normally leave unset
- `CLOUDINARY_*` — reserved for an optional managed file-storage integration

AI is optional. Without an AI key MineGov uses a deterministic data assistant over the user's accessible application records. **The official risk score is never determined by AI.**

## End-to-end demonstration

1. Sign in as `admin@example.com` and choose a mine from the top-bar scope selector.
2. Create or review a compliance requirement and its due date.
3. Submit a mobile-ready inspection; GPS can be captured or coordinates entered manually.
4. Open an inspection and create a violation from its observation.
5. Assign a corrective action to the violation.
6. Sign in as an officer/inspector to attach evidence and submit the action for verification.
7. Sign in as an authorized mine officer or administrator to verify or reject the submitted evidence.
8. An approved action automatically closes the linked violation; the risk engine recalculates mine risk and generates any applicable alerts.
9. Review the dashboard, risk analytics, notifications and audit trail; ask the AI assistant about the newly saved records.

All important records are persisted by the backend and are fetched by the frontend through REST APIs.

## Architecture

```text
src/
  components/       Application shell, reusable tables, forms, modal, feedback
  context/          JWT session, mine scope, toast notifications
  lib/              API client, formatting utilities
  pages/            Dashboard, registers, field workflow, map, reports, AI, admin
server/src/
  config/           Firebase Cloud Firestore connection and local development persistence adapter
  models/           Firestore collection definitions and document normalizers
  middleware/       JWT/RBAC, async handling, API errors
  routes/           Authentication, governance, analytics, reports and uploads
  services/         Risk, compliance, alerts, analytics, reports, search, AI, audit
  seed/             Realistic, reproducible demo dataset builder
```

### Main REST endpoints

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/mines`, `GET/PUT /api/mines/:id`
- `GET/POST /api/compliances`, `GET/PUT /api/compliances/:id`
- `GET/POST /api/inspections`, `GET /api/inspections/:id`
- `GET/POST /api/violations`, `GET/PUT /api/violations/:id`
- `GET/POST /api/actions`, `GET/PUT /api/actions/:id`, `POST /api/actions/:id/verify`
- `GET /api/dashboard/summary`, `/api/dashboard/trends`, `/api/dashboard/risk`
- `POST /api/ai/chat`, `POST /api/ai/summary`
- `GET /api/alerts`, `PUT /api/alerts/:id/read`
- `GET /api/reports/:type`, `GET /api/audit-logs`

## Security notes

- Passwords are bcrypt-hashed; JWTs expire after 12 hours.
- API operations enforce role and mine scope in the backend.
- User passwords and AI API keys are never returned to the frontend.
- Zod validates write payloads; uploads enforce file types, a 10 MB per-file limit and a file-count limit.
- The API applies Helmet, CORS configuration and rate limiting.
- Uploaded evidence is served through an authenticated endpoint; the frontend downloads it with the current bearer token.
- For deployment use a strong `JWT_SECRET`, secured Firebase Firestore credentials, HTTPS, a configured `CORS_ORIGIN`, a managed/private object store and an external secrets manager.

## Build and run

```bash
npm run build     # Type-check and create the optimized Vite build
npm start         # Start the Express API (production build can be served by a separate static host)
```

For a static production frontend, serve the generated `dist/` folder and configure the host to proxy `/api` to the Express service. The API binds to `0.0.0.0` and accepts same-origin deployment by default.
