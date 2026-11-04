# MockKernel - Phase Prompts for Antigravity

Rules file: `mockkernel-rules.md` (saved in `.agent/rules/`). Every prompt below assumes it is loaded.

## Before you start (one time, by one person)

1. Create the repo, add `docs/PRD.md` (blueprint PDF converted to text/markdown), `docs/ARCHITECTURE.png`, and your own `docs/SCREENS.md`.
2. Antigravity settings: terminal execution and review policy on manual / "request review".
3. Use a **fresh chat/session for each phase**. Paste only that phase's prompt.
4. Each engineer states their feature (F1 to F6) at the start of their feature session.

## 15-day map

| Day | Phase | Who |
|-----|-------|-----|
| 1 | P0 Onboarding, P1 Monorepo + local env | Whole team (one drives, rest review) |
| 2 | P2 Shared API contracts + schemas (blocker for parallel work) | Whole team |
| 3 | P3 CI pipeline | Engineer 6 (team watches, learns) |
| 3-10 | P4 to P9 feature phases, in parallel | Engineers 1 to 6 |
| 11-12 | P10 Integration + edge-case hardening | Whole team |
| 13 | P11 CD / deployment | Engineer 6 + one more |
| 14 | P12 Final QA, docs, demo prep | Whole team |
| 15 | Buffer / demo | Whole team |

Note: P4 to P9 run in parallel. Dependencies are handled through the contracts in P2 (mock the other features' responses until they merge).

---

## P0 - Onboarding and Understanding

```text
Follow .agent/rules/mockkernel-rules.md strictly. You are NOT allowed to create, edit or run anything in this phase.

GOAL: Prove you understood MockKernel before any work begins.

READ: docs/PRD.md, docs/ARCHITECTURE.png, docs/SCREENS.md (if present).

DO:
1. Summarize the product, the 6 zones (A-F), the 3 workflows and the 4 edge cases in your own words, max 25 lines.
2. List anything unclear, missing or contradictory in the docs (numbered).
3. List every decision from "Open decisions" in the rules file that you think blocks the first week, with your reason.
4. Show the proposed feature ownership (F1-F6) and tell me if any engineer's load looks too heavy for 15 days.
5. Ask me up to 5 questions you need answered before Phase 1.

DO NOT: write code, create files, run commands, or propose solutions yet.
DONE WHEN: I reply "P0 APPROVED".
```

---

## P1 - Monorepo Scaffold + Local Dev Environment

```text
Follow .agent/rules/mockkernel-rules.md strictly. Every file/command needs my APPROVED, one step at a time.

GOAL: A working empty monorepo that every teammate can run with 2 commands.

SCOPE: npm workspaces (client, server, worker, shared), TypeScript config, ESLint + Prettier, docker-compose for MongoDB (local) and Redis, .env.example per package, README with setup steps, .gitignore.
OUT OF SCOPE: any feature code, CI, deployment, Judge0 setup.

ASK ME FIRST (as DECISION NEEDED with options): Node version, folder layout confirmation, lint/format rules, package scripts naming, how local dev will reach Judge0, whether local MongoDB or Atlas for dev.

TEACH: explain what a monorepo, npm workspace, Docker, docker compose, container, volume and .env are, using simple analogies.

DELIVERABLES: scaffold, `docker compose up` brings Mongo + Redis up, `npm run dev` starts client/server/worker "hello" processes, README a new teammate can follow.
DONE WHEN: I run the README steps on a clean machine and they work. Show the real command output.
STOP after the report. Do not start P2.
```

---

## P2 - Shared API Contracts and DB Schemas (blocker)

```text
Follow .agent/rules/mockkernel-rules.md strictly. Contracts first, no implementation.

GOAL: Define every API contract and data schema so frontend and backend can work in parallel.

READ: PRD.md, ARCHITECTURE.png, SCREENS.md, DECISIONS.md.

ASK ME FIRST: JWT storage + refresh strategy, role model, admin creation, scoring rules, contest lifecycle, Judge0 result retrieval, interview session model (question count + difficulty), plagiarism flag handling, error response format, pagination style. Give 2-3 options each.

THEN, one feature at a time (F1 to F6) and only after I approve each, write:
- route, method, auth/role, request, success response, ALL error responses, rate-limit behavior
- Socket.io events (name, direction, payload)
- Mongoose schemas + indexes (Users, Problems, Contests, Submissions, Interviews) and the Redis key design (leaderboard, token bucket, BullMQ queue names)
- runtime validation schemas + TS types in packages/shared
- a summary in docs/API_CONTRACTS.md

DEFINITION OF DONE: every screen in SCREENS.md maps to contracts, every PRD functional requirement maps to a contract or event, all 6 engineers signed off in the PR.
Do NOT write controllers, services or UI. STOP after the report.
```

---

## P3 - CI Pipeline (GitHub Actions)

```text
Follow .agent/rules/mockkernel-rules.md strictly. Beginner mode is critical: our team has never used CI.

GOAL: Every Pull Request automatically runs install, lint, type-check, unit tests, integration tests and build. A failing check blocks merge.

FIRST EXPLAIN (simple, with analogy): what CI is, what GitHub Actions is, workflow, job, step, runner, trigger, secret, service container, caching, branch protection.

ASK ME FIRST (options): test framework, how integration tests get MongoDB/Redis in CI, caching strategy, Node version matrix (single or multiple), required reviews count, branch protection settings, PR template content, commit convention.

DELIVERABLES (each as separate approved steps): .github/workflows/ci.yml, a tiny sample unit test and integration test so the pipeline has something real to run, PR template, a docs/CI_GUIDE.md that explains "what to do when CI fails" for beginners, and the exact click-path to enable branch protection on GitHub (I will do the clicking).
VERIFY: open a test PR with an intentional failure, show it going red, fix it, show it going green. Show real output/links.
STOP after the report.
```

---

## P4 - F1: Auth and Roles (Engineer 1)

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 1, working on F1 only.

GOAL: Email + password and Google OAuth login, JWT sessions, Student/Admin role guards, end-to-end (UI + API + data).

READ: API_CONTRACTS.md (auth section), SCREENS.md (auth screens), DECISIONS.md. If a screen is missing, stop and tell me.

ASK ME FIRST (options): password hashing library, token lifetimes, Google OAuth flow details, where Admin accounts come from, session handling on the client (Zustand), error messages shown to users.

PLAN THEN BUILD, one approved step at a time: user model, register/login, Google OAuth, auth middleware (JWT), role guard middleware (exported for other features), logout/refresh as per contract, client auth store + protected routes, auth screens per SCREENS.md.

TESTS REQUIRED: unit (hashing, token helpers, role guard), integration (register, login, wrong password, expired token, role denied, Google flow with mocked provider).
EDGE CASES: duplicate email, account created via Google then password login, expired/forged token, role escalation attempt, brute-force login (rate limit hook).
SECURITY: no secrets in repo, never log tokens or passwords.
DONE WHEN: DoD checklist passes, CI green, PR description complete. STOP, do not touch other features.
```

---

## P5 - F2: Problems CRUD and Admin Dashboard (Engineer 2)

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 2, working on F2 only.

GOAL: Admin can create/read/update/delete coding problems (statement, constraints, sample + hidden test cases, supported languages Python/C++/Java/JavaScript, difficulty) and see the admin dashboard; students can browse and open problems.

READ: API_CONTRACTS.md (problems/admin), SCREENS.md (admin + problem screens), DECISIONS.md.

ASK ME FIRST (options): how test cases and expected outputs are stored, hidden vs sample test case exposure, starter-code per language, pagination/search/filter approach, soft vs hard delete, validation limits.

BUILD per approved steps: Problem model + indexes, CRUD endpoints (admin-only via F1's role guard; mock the guard until F1 merges), student read endpoints (never leak hidden test cases), admin dashboard UI, problem list/detail UI per SCREENS.md.

TESTS: unit (validation, test-case visibility filter), integration (CRUD, role denial, hidden cases never in student responses, pagination).
EDGE CASES: huge test cases, duplicate titles, deleting a problem used in a live contest, malformed test-case input, unsupported language.
DONE WHEN: DoD + CI green. STOP.
```

---

## P6 - F3: Code Execution Pipeline (Engineer 3)

Run **P6A first** (infra), then P6B.

### P6A - Judge0 on DigitalOcean droplet

```text
Follow .agent/rules/mockkernel-rules.md strictly. Beginner mode: explain Linux, SSH, droplet, firewall, docker compose, cgroups as if to a first-timer. I will type the commands on the server myself, you only give and explain them one at a time and wait for my pasted output.

GOAL: A secured Judge0 CE instance on a DigitalOcean droplet that our worker can call, supporting Python, C++, Java, JavaScript (Node).

CHECK FIRST (do not assume, verify in the official Judge0 docs and tell me what you found): the OS and kernel/cgroup requirements for the Judge0 version we will use (cgroup v1 vs v2 is a known setup trap), required docker-compose files, required config values, resource requirements vs the droplet size.

ASK ME FIRST (options): droplet size and OS image, how to secure Judge0 (auth token, firewall allow-list, reverse proxy/tunnel), polling vs callback for results, CPU/memory/time limits per language.

STEPS: droplet creation checklist (I do it), SSH hardening, firewall, install Docker, deploy Judge0, test with a hello-world submission per language, record config in docs/JUDGE0_SETUP.md (no secrets in the file).
DONE WHEN: I can submit code in all 4 languages from my laptop and get correct verdicts, and unauthenticated requests are rejected. Show real outputs. STOP.
```

### P6B - Submission pipeline

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 3, working on F3 only. Workflow 1 from ARCHITECTURE.png (steps 1-10).

GOAL: Run Code/Submit in Monaco -> API -> PENDING submission -> BullMQ -> worker -> Judge0 -> verdict -> MongoDB COMPLETED -> Socket.io (or polling) to the verdict panel, within 10 seconds.

READ: API_CONTRACTS.md (submissions + socket events), SCREENS.md (editor + verdict panel), DECISIONS.md, docs/JUDGE0_SETUP.md.

ASK ME FIRST (options): queue names/job options, concurrency, retry policy, how the worker waits for Judge0 (poll interval or callback), verdict mapping table, socket room design, what Run Code (sample tests) vs Submit (hidden tests) does, source-code size limit.

BUILD per approved steps: submit endpoint (returns 202 + submission id), BullMQ producer, worker consumer, Judge0 client, 10s Timeout Guard, verdict mapping, DB updates, Socket.io emitter + polling fallback, Monaco editor UI with language selector, verdict panel states (Pending, Running, Completed, errors).

EDGE CASES (code + test for each): E2 infinite loop/hang -> Timeout Guard marks Time Limit Exceeded at 10s; Judge0 unreachable; worker crash mid-job (job not lost, no double-counted result); duplicate delivery of the same job; compilation error; runtime error; output too large; user disconnects before verdict; E4 spam clicks (coordinate with F4's limiter).
TESTS: unit (verdict mapping, timeout guard), integration (full queue flow with Judge0 mocked, plus one real Judge0 smoke test documented).
DONE WHEN: DoD + CI green. STOP.
```

---

## P7 - F4: Contests, Leaderboard, Rate Limiter (Engineer 4)

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 4, working on F4 only.

GOAL: Admin creates and runs live contests; students join and compete; Redis leaderboard updates instantly after a valid Accepted submission; Redis Token-Bucket rate limiter protects the gateway.

READ: API_CONTRACTS.md (contests, leaderboard), SCREENS.md (contest + leaderboard screens), DECISIONS.md.

ASK ME FIRST (options): contest lifecycle and timing rules, scoring and tie-break rules, how repeat Accepted submissions count, leaderboard key design and snapshot/persistence, token-bucket parameters per route group (submit, auth, AI), whether the limiter is atomic via Lua script, what the client sees on HTTP 429 (retry-after).

BUILD per approved steps: contest model + endpoints (admin and student), join/leave, leaderboard service (ZINCRBY) and read endpoint, live leaderboard UI, rate-limiter middleware (exported for all routes) with a Redis-backed atomic implementation.

EDGE CASES (code + test): E4 spam clicking blocked with 429 + retry-after; contest ends while submission is in flight; late submissions; leaderboard rebuild if Redis data is lost (from MongoDB); concurrent score updates; user joins twice; clock/time-zone issues; Redis down (decide fail-open vs fail-closed via a decision).
TESTS: unit (token bucket math, scoring), integration (concurrent requests, leaderboard ordering, 429 behavior).
DONE WHEN: DoD + CI green. STOP.
```

---

## P8 - F5: AI Interview (Engineer 5)

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 5, working on F5 only. Workflow 2 from ARCHITECTURE.png.

GOAL: Voice-enabled adaptive interview on CS fundamentals (OS, DBMS, Data Structures). BEFORE the session, the student chooses the number of questions and the difficulty (Easy / Medium / Hard). Answers are captured by Web Speech API, evaluated by Groq (Llama-3.3, strict JSON mode), and the next question adapts.

READ: API_CONTRACTS.md (interview), SCREENS.md (interview screens), DECISIONS.md.

ASK ME FIRST (options): allowed question counts, whether topics are student-selected or mixed, how difficulty influences the prompt, the "State Machine Prompt" states, JSON schema of the model reply (evaluation score, feedback, next question), per-answer scoring rubric, final feedback report, how much chat history is sent (token budget), Groq model id and parameters, backoff and retry numbers, what is stored in MongoDB, how the reply is streamed to the client.

BUILD per approved steps: Interview model, session start endpoint (count + difficulty), answer endpoint, prompt templates in one reviewable file, Groq client with strict JSON validation + repair/reject strategy, E3 exponential backoff + retry queue, Interview chat UI, voice capture + E1 fallback to a manual textarea, session summary screen per SCREENS.md.

EDGE CASES (code + test): E1 mic denied/unsupported browser; E3 Groq 429 with backoff; Groq returns invalid JSON; Groq timeout; empty or very long answer; user answers off-topic; user leaves mid-session and returns (resume or end); prompt injection inside the spoken answer; duplicate answer submit; session count reached.
TESTS: unit (JSON validation, prompt builder, backoff timing), integration (full loop with Groq mocked, failure injection).
DONE WHEN: DoD + CI green. STOP.
```

---

## P9 - F6: Plagiarism Detection (Engineer 6)

```text
Follow .agent/rules/mockkernel-rules.md strictly. I am Engineer 6, working on the plagiarism part of F6. Workflow 3 from ARCHITECTURE.png.

GOAL: After an Accepted verdict during a LIVE contest, normalize and tokenize the code (strip whitespace/comments, normalize variable names via AST), compare against earlier submissions of the SAME live contest and SAME problem using Levenshtein distance, then only if safe allow the leaderboard ZINCRBY.

READ: API_CONTRACTS.md, DECISIONS.md, F3 and F4 contracts (how this plugs in).

ASK ME FIRST (options): tokenizer/parser approach for Python, C++, Java, JavaScript (e.g. a multi-language parser vs per-language parsers vs a simpler lexer approach, with accuracy/effort trade-offs), similarity threshold, hash/index strategy to keep it fast, sync vs async execution, what "flagged" means for score and for the admin, who can see flags.

BUILD per approved steps: normalizer per language, token hashing, Levenshtein similarity, comparison service scoped to the active contest, flag storage and admin view per SCREENS.md, integration hook between verdict -> plagiarism -> leaderboard.

EDGE CASES (code + test): same user resubmitting their own code, trivial templates/boilerplate, very short solutions, very large code, unparsable code (syntax errors), different formatting of identical logic, renamed variables, reordered independent statements (document as known limitation), performance with many submissions, contest not live (skip).
TESTS: unit (normalization, similarity, threshold), integration (flagged vs safe flow), plus a small labeled sample set of known-plagiarized vs different solutions with measured results shown to me.
DONE WHEN: DoD + CI green. STOP.
```

---

## P10 - Integration and Edge-Case Hardening

```text
Follow .agent/rules/mockkernel-rules.md strictly. Whole team session, one driver.

GOAL: All features work together as in ARCHITECTURE.png, and edge cases E1-E4 are proven.

STEPS (each approved): list every workflow step 1-10 / 1-5 / W3.1-3 and mark which contract or code path implements it; run each workflow end-to-end in local docker compose and show evidence; write an end-to-end test plan with me; then prove E1, E2, E3, E4 with real runs (deny mic, infinite loop code, Groq 429 simulation, spam clicks).
ALSO CHECK: every acceptance criterion in PRD (verdict within 10s, instant leaderboard, mic fallback); error and loading states on every screen in SCREENS.md; role-based access; no secrets or hidden test cases leaking; unhandled promise rejections; logs useful for debugging.
OUTPUT: a pass/fail table with evidence, a bug list ranked by severity with fix options. Fix only what I approve. STOP.
```

---

## P11 - CD / Deployment

```text
Follow .agent/rules/mockkernel-rules.md strictly. Beginner mode: explain CD, hosting, environment variables, build vs runtime, domains, CORS, health checks.

GOAL: Merge to main automatically deploys: client -> Vercel, server + worker -> Render or Railway, with MongoDB Atlas, managed Redis and the Judge0 droplet connected.

ASK ME FIRST (options): Render vs Railway (cost, sleeping/free-tier limits, worker support), managed Redis provider, environments (staging + production or just production), how env vars/secrets are managed per platform, custom domain or default URLs, health check endpoints, rollback plan, how Socket.io works behind the chosen host.

STEPS: pre-deploy checklist, env var matrix (names only, no values), deploy order, CORS and cookie/domain settings, production smoke test script, docs/DEPLOYMENT.md, rollback instructions. I do all dashboard clicking and secret entry; you guide click-by-click.
DONE WHEN: a PR merged to main shows up live, the full flow works on production URLs, and a deliberately broken PR cannot reach production. Show evidence. STOP.
```

---

## P12 - Final QA, Docs and Demo Prep

```text
Follow .agent/rules/mockkernel-rules.md strictly.

GOAL: Handover-ready project and a demo that does not fail.

STEPS (each approved): final regression checklist across all features and screens; update README, docs/DECISIONS.md, docs/API_CONTRACTS.md to match reality; known-limitations list; demo script (Competitor, Interviewee, Admin journeys from PRD) with exact click path and test accounts/data; a fallback plan for every demo risk (Judge0 down, Groq 429, no mic, network); dependency and secret audit.
OUTPUT: checklist with evidence, demo script, risk list. STOP.
```
