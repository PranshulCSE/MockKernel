# MockKernel Backend Server

Express 5 + TypeScript (ESM) API gateway for MockKernel, handling JWT/Google authentication, problems & test cases, BullMQ code execution submissions, live contests & Redis leaderboards, AI mock interviews (Groq), plagiarism detection, and Socket.io realtime updates.

## Prerequisites

- **Node.js** `>= 20` (tested on Node 24)
- **MongoDB** (local `mongod` or MongoDB Atlas; replica set recommended for multi-document ACID transactions)
- **Redis** (required for BullMQ queues, atomic token-bucket rate limiting, and contest leaderboards)
- **Judge0 CE** (Docker instance used by `Worker` and checked by `/health/ready`)

## Local Infrastructure Setup

### MongoDB
```bash
# Using Docker (single-node replica set for full transaction support)
docker run -d --name mockkernel-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec -it mockkernel-mongo mongosh --eval "rs.initiate()"
```

### Redis
```bash
docker run -d --name mockkernel-redis -p 6379:6379 redis:7-alpine
```

### Judge0 CE
Run Judge0 CE on `http://localhost:2358` using the official Judge0 Docker Compose setup (ensure `privileged: true` / cgroups are configured per Judge0 documentation), and set `JUDGE0_API_URL=http://localhost:2358`.

## Environment Variables

Copy `.env.example` from the repository root (or create `Server/.env`):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `MONGODB_URI` | **Yes** | — | MongoDB connection URI (`mongodb://` or `mongodb+srv://`) |
| `JWT_SECRET` | **Yes** | — | HMAC secret for signing JWTs (min 8 chars dev, 16+ prod) |
| `JWT_EXPIRES_IN` | No | `7d` | JWT expiration duration |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed browser origins |
| `CLIENT_URL` | No | `http://localhost:5173` | Fallback allowed origin when `CORS_ORIGINS` is unset |
| `REDIS_HOST` | No | `127.0.0.1` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_URL` | No | — | Full `redis://` or `rediss://` URL (overrides host/port) |
| `RATE_LIMIT_FAIL_OPEN` | No | `true` | Allow requests if Redis rate limiter is unreachable |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID for `POST /api/auth/google` |
| `GROQ_API_KEY` | No | — | Groq API key for AI interviews |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq model identifier |
| `JUDGE0_API_URL` | No | `http://localhost:2358` | Judge0 base URL for readiness checks |
| `JUDGE0_API_KEY` | No | — | Optional `X-Auth-Token` for Judge0 |
| `SUBMISSION_QUEUE_NAME` | No | `submission-queue` | BullMQ queue name shared with `Worker` |
| `PLAGIARISM_THRESHOLD` | No | `0.85` | Similarity threshold `(0, 1]` for flagging |

## Commands

```bash
cd Server
npm install
npm run typecheck   # Type-check src/ and tests/
npm run build       # Compile TypeScript to dist/
npm test            # Run Vitest test suite
npm start           # Start compiled production server (node dist/index.js)
npm run dev         # Start TypeScript dev server with live reload (tsx watch)
```

## Authentication

Protected routes require a Bearer JWT in the `Authorization` header:

```http
Authorization: Bearer <accessToken>
```

Roles: `user`, `admin`, `superadmin`.

## Health & Readiness Endpoints

- `GET /health`: Reports server uptime, MongoDB connection status (`200` when connected, `503` when disconnected), and Redis client status.
- `GET /health/ready` (alias `GET /ready`): Actively pings MongoDB, Redis, and Judge0 (`200` when all dependencies are healthy, `503` otherwise).

## API Routes Overview

### Auth (`/api/auth`)
- `POST /api/auth/register` — Register a new `user` account
- `POST /api/auth/login` — Email/password login returning `{ user, accessToken }`
- `POST /api/auth/google` — Google OAuth ID token login
- `GET /api/auth/me` — Current authenticated user profile
- `POST /api/auth/logout` — Logout confirmation

### Problems (`/api/problems` & `/api/admin/problems`)
- `GET /api/problems` — List published problems (pagination, `search`, `difficulty`)
- `GET /api/problems/:id` — Get published problem with ordered sample test cases
- `GET /api/admin/problems` — List all problems (admin/superadmin)
- `POST /api/admin/problems` — Create problem + test cases in a transaction
- `GET /api/admin/problems/:id` — Get full problem + all test cases
- `PATCH /api/admin/problems/:id` — Update problem + replace test cases in a transaction
- `DELETE /api/admin/problems/:id` — Delete problem + test cases (blocked if in a `live` contest)

### Submissions (`/api/submissions`)
- `POST /api/submissions` — Enqueue `run` or `submit` code execution (`202 Accepted`)
- `POST /api/submissions/run` — Run code against sample test cases (`202 Accepted`)
- `POST /api/submissions/submit` — Submit code against all test cases (`202 Accepted`)
- `GET /api/submissions` — List authenticated user's submissions
- `GET /api/submissions/:id` — Get submission details (owner or admin)
- `GET /api/submissions/:id/status` — Poll submission verdict and test case results

### Contests (`/api/contests` & `/api/admin/contests`)
- `GET /api/contests` — List `live` and `ended` contests
- `GET /api/contests/:id` — Get contest details
- `GET /api/contests/:id/participants` — List eligible contest participants
- `GET /api/contests/:id/submissions` — List authenticated user's contest submissions
- `GET /api/contests/:id/leaderboard` — Paginated contest leaderboard
- `POST /api/contests/:id/join` — Join a `live` contest
- `POST /api/contests/:id/leave` — Leave before submitting
- `GET /api/admin/contests` / `POST /api/admin/contests` / `GET /api/admin/contests/:id`
- `PATCH /api/admin/contests/:id` — Edit `draft` contest
- `PATCH /api/admin/contests/:id/status` — Transition `draft -> live -> ended`
- `POST /api/admin/contests/:id/start` / `POST /api/admin/contests/:id/end`
- `DELETE /api/admin/contests/:id` — Delete `draft` contest
- `GET /api/admin/contests/:id/participants` / `GET /api/admin/contests/:id/submissions`
- `GET /api/admin/contests/:id/flagged` — Flagged plagiarism submissions
- `POST /api/admin/contests/:id/leaderboard/rebuild` — Rebuild Redis leaderboard from MongoDB
- `PATCH /api/admin/contests/:id/participants/:userId/disqualify`

### AI Interviews (`/api/interviews`)
- `POST /api/interviews` — Start adaptive interview (`topics`, `difficulty`, `questionCount`)
- `GET /api/interviews` — List user's interview history
- `GET /api/interviews/:id` — Get session details (owner or admin)
- `POST /api/interviews/:id/answer` — Submit answer, receive score/feedback & next question
- `POST /api/interviews/:id/complete` — Complete active session and generate summary
- `PATCH /api/interviews/:id/abandon` — Abandon active session

### Users (`/api/users`)
- `GET /api/users/me/stats` — Student dashboard KPIs: solved/attempted problems, submissions, contests joined, and interview stats

### Admin (`/api/admin`)
- `GET /api/admin/stats` — Platform counts (`admin` / `superadmin`)
- `POST /api/admin/users` — Create admin account (`superadmin` only)
- `GET /api/admin/users` — Paginated/filtered user list (`superadmin` only)

## Example Requests

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"Password123!"}'

# Submit code
curl -X POST http://localhost:3000/api/submissions/submit \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"problemId":"<PROBLEM_ID>","language":"python","sourceCode":"print(input())"}'
```
