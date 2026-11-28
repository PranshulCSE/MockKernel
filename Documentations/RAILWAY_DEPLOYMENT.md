# Railway deployment

MockKernel is a monorepo with three Railway services. Create one service for each directory and set its **Root Directory** and **Config File** as shown below. Railway's config file path is relative to the repository root even when a service root directory is set.

| Service | Root Directory | Config File |
| --- | --- | --- |
| Client | `/Client` | `/Client/railway.toml` |
| Server | `/Server` | `/Server/railway.toml` |
| Worker | `/Worker` | `/Worker/railway.toml` |

Generate a public domain for Client and Server. Worker is a background process and does not need a public domain. Client uses Vite's preview server to serve the built SPA and listens on Railway's injected `PORT`. The client build needs the public Server URL as `VITE_API_URL`; this value is embedded into the bundle at build time, so set it before deploying Client and redeploy Client if the Server domain changes. The same value is used by the API client and Socket.IO.

## Variables

Set these variables in Railway service settings. Use Railway's variable references where supported to avoid duplicating shared values.

### Server

- `NODE_ENV=production`
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — long random secret (at least 16 characters)
- `CORS_ORIGINS` — exact public Client origin, e.g. `https://your-client-domain.up.railway.app` (no trailing slash)
- `REDIS_URL` — managed Redis URL (`redis://` or `rediss://`); Redis is enabled by default in production
- `JUDGE0_API_URL` — reachable Judge0 base URL
- `JUDGE0_API_KEY` — when Judge0 requires authentication
- `GROQ_API_KEY` — required for AI interview endpoints
- `GOOGLE_CLIENT_ID` — required for Google sign-in
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — when email features are used

Railway injects `PORT`. The server binds to it and exposes `/health` for the Railway health check.

### Worker

- `NODE_ENV=production`
- `MONGODB_URI` — same database as Server
- `REDIS_URL` — same managed Redis as Server; both processes must use the same queue
- `JUDGE0_API_URL` and `JUDGE0_API_KEY` — same Judge0 service and credentials as Server
- `SUBMISSION_QUEUE_NAME` — set to the same value for Server and Worker if overriding the default (`submission-queue`)
- `WORKER_CONCURRENCY` — optional; defaults to `5`

### Client

- `VITE_API_URL` — public Server origin, e.g. `https://your-server-domain.up.railway.app` (no trailing slash)
- `VITE_GOOGLE_CLIENT_ID` — same Google OAuth web client ID used by Server

Add the deployed Client URL to the Google OAuth authorized JavaScript origins. Configure the production domain in the OAuth consent/client settings.

## Deploy order

1. Provision MongoDB, Redis, and Judge0, and set Server and Worker variables.
2. Deploy Server and Worker.
3. Generate the Server public domain and set it as Client's `VITE_API_URL`.
4. Set the Client's public domain as Server's `CORS_ORIGINS` value, then redeploy Server.
5. Deploy Client. Check Client's domain, Server's `/health`, and a sign-in/API request in the browser.

`/health/ready` checks MongoDB, Redis (when enabled), and Judge0. Railway uses `/health` for startup so a temporary Judge0 outage does not prevent the API from starting; code execution still depends on Judge0 being reachable.
