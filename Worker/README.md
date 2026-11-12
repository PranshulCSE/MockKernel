# MockKernel Execution Worker

Background BullMQ worker that consumes code execution jobs from Redis, runs test cases against Judge0 CE, and persists verdicts and per-test-case results to MongoDB.

## Environment Variables

Copy `Worker/.env.example` to `Worker/.env`:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | **Yes** | — | MongoDB connection string |
| `REDIS_HOST` | No | `127.0.0.1` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_URL` | No | — | Optional full Redis URL |
| `JUDGE0_API_URL` | No | `http://localhost:2358` | Judge0 base URL |
| `JUDGE0_API_KEY` | No | — | Optional Judge0 `X-Auth-Token` |
| `SUBMISSION_QUEUE_NAME` | No | `submission-queue` | BullMQ queue name |
| `POLL_INTERVAL_MS` | No | `1000` | Judge0 polling interval (ms, min 10) |
| `MAX_POLL_ATTEMPTS` | No | `20` | Max Judge0 polling attempts |
| `WORKER_CONCURRENCY` | No | `5` | Concurrent BullMQ jobs |

## Commands

```bash
cd Worker
npm install
npm run typecheck   # Type-check src/ and tests/
npm run build       # Compile TypeScript to dist/
npm test            # Run Vitest unit/worker tests
npm start           # Run compiled worker (node dist/index.js)
npm run dev         # Run TypeScript worker in watch mode (tsx watch)
```
