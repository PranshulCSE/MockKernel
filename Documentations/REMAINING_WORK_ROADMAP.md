# MockKernel — Codebase Audit & Remaining Work Roadmap

> **Purpose:** Team-wide status audit of `Server/`, `Worker/`, `Client/`, and DevOps/Infrastructure, listing everything that is already built vs. what remains to be implemented before integration, deployment, and demo.

---

## 1. Executive Summary & Current Build Health

| Package | Overall Status | Typecheck / Lint | Tests / Build (Verified 2026-11-12) |
| --- | --- | --- | --- |
| **`Server/`** | ~90–95% complete (core APIs, auth, queues, sockets, AI, plagiarism, rate limiter built) | `npm run typecheck` passed | `8` unit tests passed; `30` `supertest` HTTP tests could not bind local sockets in sandbox (`EPERM 127.0.0.1`) — run `npm --prefix Server test` locally to verify |
| **`Worker/`** | ~90% complete (BullMQ consumer + Judge0 polling client built; needs 10s TLE Timeout Guard alignment) | `npm run typecheck` passed | `npm test` passed (`3` files, `12/12` tests) |
| **`Client/`** | ~15–20% complete (Theme C Neon Glass shell, auth UI with `localStorage` mock, placeholder pages) | `npm run lint` passed | `npm run build` **fails** (`VerdictBadge.tsx` missing `RUNNING` and `INTERNAL_ERROR`) |
| **DevOps / Infra** | ~5% complete (`.env.example` files exist; no `docker-compose.yml`, `.github/workflows/`, Dockerfiles, or Judge0 setup) | — | — |

---

## 2. Backend (`Server/` & `Worker/`) — Status & Remaining Tasks

### 2.1 Already Built in `Server/` & `Worker/`
- **Database Models (`Server/src/models/`):** `User` (with `Student`, `Admin`, `SuperAdmin` discriminators), `Problem`, `TestCase`, `Submission`, `Contest`, `ContestParticipant`, `InterviewSession`, plus `Server/src/scripts/initDb.ts`.
- **Auth & Security (`F1`):** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google` (Google `idToken` verification), `GET /api/auth/me`, `POST /api/auth/logout`; JWT `authenticate` / `optionalAuthenticate` / `requireRole`; Helmet, CORS allowlist, input sanitization, `/health` & `/health/ready`.
- **Problems & Admin (`F2`):** Public `GET /api/problems`, `GET /api/problems/:id` (sample cases only); Admin `GET/POST/PATCH/DELETE /api/admin/problems` (with transactions and live-contest delete guard); `GET /api/admin/stats`, `POST/GET /api/admin/users` (`superadmin` only).
- **Code Execution Pipeline (`F3`):** `POST /api/submissions`, `/run`, `/submit` (`202 Accepted` + BullMQ `enqueueSubmission`), `GET /api/submissions`, `/:id`, `/:id/status`; Worker BullMQ consumer (`Worker/src/queues/submissionWorker.ts`) + Judge0 HTTP client (`Worker/src/services/judge0.ts`); Socket.io `verdict:update` & `leaderboard:update` (`Server/src/services/verdictEmitter.ts`).
- **Contests, Leaderboard & Rate Limiter (`F4`):** Public `GET /api/contests`, `/:id`, `/:id/participants`, `/:id/submissions`, `/:id/leaderboard`, `POST /:id/join`, `/:id/leave`; Admin contest CRUD, `draft -> live -> ended` transitions, `start`/`end`, `leaderboard/rebuild`, `flagged`, `disqualify`; Redis `ZINCRBY` leaderboard + MongoDB fallback (`Server/src/services/leaderboardService.ts`); atomic Lua Redis token-bucket rate limiter (`submit`, `auth`, `ai`, `general`) returning `429` + `Retry-After` (`Server/src/middleware/rateLimiter.ts`).
- **AI Interview (`F5`):** `POST /api/interviews`, `GET /api/interviews`, `GET /api/interviews/:id`, `POST /api/interviews/:id/answer`, `POST /api/interviews/:id/complete`, `PATCH /api/interviews/:id/abandon`; Groq Llama-3.3 JSON mode + schema validation + repair pass (`Server/src/services/groqService.ts`) + exponential backoff retry (`Server/src/services/groqRetry.ts`).
- **Plagiarism Detection (`F6`):** Comment/whitespace stripping + identifier normalization (`Server/src/services/plagiarism/normalizer.ts`) + Levenshtein similarity scoped to live contest & problem (`Server/src/services/plagiarism/plagiarismService.ts`), hooked into `handleSubmissionCompleted` before leaderboard scoring.

### 2.2 Remaining Backend & Worker Work
- [ ] **SuperAdmin & Sample Data Seed Script (`F1` / `F2`):**
  - `Server/src/scripts/initDb.ts` only initializes collections and indexes. Because `POST /api/auth/register` always creates role `user` and `POST /api/admin/users` requires `superadmin`, add a seed script (e.g., `Server/src/scripts/seed.ts`) to bootstrap an initial `SuperAdmin` account (from env vars) and sample published problems + test cases for local dev/demo.
- [ ] **Enforce 10s Worker Timeout Guard -> `TLE` (`F3`, Edge Case E2):**
  - Currently `Worker/src/config/env.ts` defaults `POLL_INTERVAL_MS=1000` and `MAX_POLL_ATTEMPTS=20` (up to 20s per test case), and `JUDGE0_POLL_TIMEOUT` is caught in `Worker/src/queues/submissionWorker.ts` and saved as `INTERNAL_ERROR`.
  - Update the worker/Judge0 guard to enforce the PRD's 10-second execution SLA and mark hanging Judge0 tasks as `TLE` (Time Limit Exceeded) rather than `INTERNAL_ERROR`.
- [ ] **Align Google OAuth Token Flow (`F1`):**
  - `Server/src/controllers/authController.ts` (`POST /api/auth/google`) requires `{ idToken }` verified via `OAuth2Client.verifyIdToken()`, whereas `Client/src/components/auth/GoogleButton.tsx` currently uses `useGoogleLogin` (which yields an OAuth `access_token`). Decide whether to switch `Client` to `<GoogleLogin>` (`credential` ID token) or add `access_token` verification on `Server`.
- [ ] **Resolve Scope Questions / Optional Endpoints:**
  - **Student Stats Endpoint:** Decide whether Student Dashboard KPIs (solved count, attempted count, contests joined, interview stats) will be computed from existing `GET /api/submissions` + `GET /api/interviews` or backed by a dedicated `GET /api/users/me/stats` endpoint.
  - **3-Tier Hint Engine:** Mentioned in root `README.md`, but absent from `Documentations/MockKernel_Project_Blueprint.pdf` and `Documentations/mockkernel-rules.md` (which restricts scope to the PRD). Either implement a Hints schema/endpoint or remove the mention from `README.md`.
- [ ] **Local & Live Integration Verification:**
  - Run `npm --prefix Server test` outside sandbox to confirm all 38 tests pass.
  - Run an end-to-end test against real MongoDB (`rs0`), Redis, Judge0 CE, and Groq API.

---

## 3. Frontend (`Client/`) — Status & Remaining Tasks

### 3.1 Already Built in `Client/`
- **Styling & Layout Shell:** Theme C (**Neon Glass**) Tailwind config (`Client/tailwind.config.ts`), `Background`, `Logo`, `Navbar`, `AppLayout`.
- **Basic UI Components (`Client/src/components/ui/`):** `Button`, `GlassCard`, `Input`, `Badge`, `Chip`, `VerdictBadge` (broken build).
- **Pages & Auth Shell:** `LandingPage`, `LoginPage`, `SignupPage`, `AuthForm`, `GoogleButton`, `NotFoundPage`, `RouteGuards` (`RequireAuth`, `GuestOnly`), placeholder `PracticePage` (hardcoded `sampleProblems`), placeholder `InterviewPage` (setup form only), `authStore` (Zustand persisted to `localStorage`), and `Client/src/api/auth.ts` (`localStorage` mock).

### 3.2 Remaining Frontend Work

#### A. Immediate Fixes & Dependencies
- [ ] **Fix Build Error (`VerdictBadge.tsx`):** Add `RUNNING` and `INTERNAL_ERROR` entries (with color + icon + text label) to `Client/src/components/ui/VerdictBadge.tsx`.
- [ ] **Install Required Packages:** Add `@monaco-editor/react` and `socket.io-client` to `Client/package.json`.

#### B. Core API, Auth & Realtime Layer
- [ ] **HTTP API Client (`src/api/client.ts`):** Configure `VITE_API_URL`, attach `Authorization: Bearer <accessToken>`, handle `401` logout/redirect, parse backend `{ error: { code, message, details } }` payloads, and surface `429` + `Retry-After` headers for cooldown UI.
- [ ] **Replace Mock Auth (`F1`):** Wire `Client/src/api/auth.ts` to `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/me`, and `POST /api/auth/logout`; align `GoogleButton.tsx` with `idToken` (or backend choice).
- [ ] **Domain API Modules:** Create `src/api/problems.ts`, `src/api/submissions.ts`, `src/api/contests.ts`, `src/api/interviews.ts`, `src/api/admin.ts`.
- [ ] **Socket.io Client + Polling Fallback (`F3`, `F4`):**
  - Connect with `{ auth: { token } }`, track connection state (`connected` / `reconnecting` / `polling`), and display a live socket status indicator.
  - Subscribe to `verdict:update` (note: server emits `verdict:update`, not `submission:update`) and `leaderboard:update`.
  - Support `contest:join` / `contest:leave` room events.
  - Automatically fall back to polling `GET /api/submissions/:id/status` when the socket is disconnected.

#### C. Reusable UI Components & Route Guards (per `Documentations/screens.md.pdf`)
- [ ] **Missing Primitives (`Client/src/components/ui/`):** `Modal` (including destructive confirmation modals), `Toast` (top-right notifications), `DataTable`, `Skeleton`, `EmptyState`, `Timer` (contest countdown), `Tabs`, `Drawer`, `ResizablePanels`.
- [ ] **Role Guards & Navigation (`F1`, `F2`):** Add `RequireRole` (`admin` / `superadmin`) in `RouteGuards.tsx`, and show role-appropriate navigation links (`Practice`, `Contests`, `Interview`, `Dashboard`, `Admin`) in `Navbar.tsx`.

#### D. Feature Screens to Build
- [ ] **Problem List & Coding Workspace / Arena (`F2` + `F3`):**
  - Wire `/practice` to `GET /api/problems` (search, difficulty filter, pagination, loading/empty/error states).
  - Build Problem Workspace (`/problems/:id` and contest problem view): split panes (statement + constraints + sample test cases on left, `@monaco-editor/react` on right, collapsible bottom Console/Verdict panel).
  - Language selector (`python`, `cpp`, `java`, `javascript`) loading problem `starterCode`, draft persistence in `localStorage`/memory, and unsaved-code navigation warning.
  - `Run Code` (`POST /api/submissions/run`) & `Submit` (`POST /api/submissions/submit`) with immediate optimistic `PENDING` state, live test-case results, Edge Case E2 `10s` TLE explanation, Edge Case E4 `429` cooldown ring/timer (`"Slow down — try again in Ns"`), and neutral `"Under review"` display when `PLAGIARISM_FLAGGED`.
  - Submission history tab for the problem.
- [ ] **AI Mock Interview Room, Summary & History (`F5`):**
  - Connect setup form on `/interview` to `POST /api/interviews` (`topics`, `difficulty`, `questionCount`).
  - Build `/interview/:id` room: progress indicator (`Q3/8`), Web Speech API (`SpeechRecognition`) voice capture with live transcript, **automatic inline fallback banner + manual textarea** if microphone permission is denied or browser is unsupported (Edge Case E1), `"AI is busy, retrying…"` indicator on `429`/retry (Edge Case E3), per-answer score + feedback display, `Complete Early` / `Abandon` actions.
  - Build Final Feedback Summary screen (`overallScore`, `feedback`, question-by-question review) and past interview history list (`GET /api/interviews`).
- [ ] **Contests & Live Leaderboard (`F4`):**
  - Contests list (`/contests`) showing `live` and `ended` contests with status badges and join state.
  - Contest detail & Arena (`/contests/:id`): `Join` / `Leave` actions, countdown `Timer`, problem tabs with solved/attempted indicators, contest submission history.
  - Live Leaderboard view (`GET /api/contests/:id/leaderboard` + Socket.io `leaderboard:update`): ranked table, current user row highlight, and rank/score updates.
- [ ] **Student Dashboard (`/dashboard`):**
  - Stat tiles (solved problems, submissions, contests joined, interviews completed) + recent activity feed (recent submissions & past interviews).
- [ ] **Admin & SuperAdmin Dashboard (`F2`, `F4`, `F6`):**
  - Overview stats (`GET /api/admin/stats`).
  - **Problems CRUD (`/admin/problems`):** List all (published + drafts), create/edit problem form with multi-language `starterCode`, ordered sample/hidden test case builder, publish toggle, delete confirmation modal.
  - **Contests CRUD & Live Monitor (`/admin/contests`):** Create/edit `draft` contests, `Start` / `End` contest actions, `Rebuild Leaderboard` button, live participants & submissions tables.
  - **Plagiarism Review (`/admin/contests/:id/flagged`):** View flagged submissions (`similarity` score, matched submission reference) + `Disqualify Participant` confirmation modal.
  - **SuperAdmin User Management (`/admin/users`):** List users/admins with role filter & search, and create Admin accounts (`POST /api/admin/users`).

---

## 4. DevOps, Infrastructure & Repo Tooling — Remaining Tasks

- [ ] **Local Multi-Service Orchestration:**
  - Create root `docker-compose.yml` for local MongoDB (configured as single-node replica set `rs0` for Mongoose ACID transactions) and Redis 7.
  - Add a root `package.json` (npm workspaces or `concurrently` scripts) so teammates can install, typecheck, test, and run `Client` + `Server` + `Worker` cleanly.
- [ ] **Judge0 CE Execution Sandbox (Zone E):**
  - Provision Judge0 CE locally or on a DigitalOcean droplet using the official Judge0 Docker Compose setup (verify cgroup v1/v2 compatibility).
  - Secure with `JUDGE0_API_KEY` (`X-Auth-Token`) and firewall/tunnel rules, verify Python/C++/Java/Node execution, and document steps in `docs/JUDGE0_SETUP.md`.
- [ ] **CI Pipeline (`.github/workflows/ci.yml`):**
  - Create `.github/` directory and PR workflow running `npm ci`, lint, `typecheck`, unit + integration tests (with MongoDB & Redis service containers), and production builds for `Client`, `Server`, and `Worker`.
  - Enable GitHub branch protection on `main` (require green CI + at least 1 PR review).
- [ ] **CD & Production Deployment:**
  - Add `Server/Dockerfile` and `Worker/Dockerfile` (if deploying via Docker on Render/Railway).
  - Deploy `Client` to **Vercel** (`VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`).
  - Deploy `Server` (web service) and `Worker` (background worker) to **Render or Railway**, connected to MongoDB Atlas, Managed Redis, Groq API, and Judge0 CE.
  - Configure production `CORS_ORIGINS`, `JWT_SECRET`, and WebSocket/Socket.io support, and document in `docs/DEPLOYMENT.md`.
- [ ] **Contracts & Documentation Sync:**
  - Optionally extract duplicated request/response/verdict types into a shared `Shared/` workspace (or document all live endpoints & Socket events in `docs/API_CONTRACTS.md` and choices in `docs/DECISIONS.md`).

---

## 5. Recommended Execution Order for the Team

1. **Immediate Unblockers (Day 1):** Fix `VerdictBadge.tsx` build error, add root `docker-compose.yml` (`mongo:7 --replSet rs0` + `redis:7-alpine`), add SuperAdmin + problem seed script, fix Worker 10s `TLE` Timeout Guard, and align Google OAuth (`idToken`).
2. **Judge0 + E2E Backend Verification (Day 1–2):** Bring up Judge0 CE, run all `Server` + `Worker` tests locally, and verify a real submission end-to-end.
3. **Frontend Parallel Sprint (Days 2–6):**
   - *Track A:* Shared UI kit + API client + Socket.io hook + real Auth.
   - *Track B:* Practice list + Monaco Coding Arena + Verdict panel.
   - *Track C:* AI Interview Room (Voice + E1 textarea fallback + E3 retry UI + Summary).
   - *Track D:* Contests + Live Leaderboard + Student Dashboard.
   - *Track E:* Admin Dashboard (Problems CRUD, Contests CRUD, Plagiarism Monitor, SuperAdmin Users).
4. **CI/CD & Hardening (Days 7–8):** Add `.github/workflows/ci.yml`, test E1–E4 edge cases end-to-end, deploy to Vercel + Render/Railway, and run final QA.
