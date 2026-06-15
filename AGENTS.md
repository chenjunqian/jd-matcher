# JD Matcher — Cloudflare Workers

## Rules

- **Git commit/push**: Every git commit and push requires explicit user approval before execution. This applies to every single operation — prior approval for a previous change does not carry over to new changes.

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Web framework**: Hono.js
- **Bot library**: grammY
- **Database**: D1 (SQLite)
- **Vector search**: Cloudflare Vectorize
- **Session state**: Cloudflare KV
- **Async jobs**: Cloudflare Queues
- **Cron triggers**: Single hourly cron (`0 * * * *`), handler dispatches job types based on hour
- **AI SDK**: Vercel AI SDK (`ai` + `@ai-sdk/openai`) for agent-based job matching
- **Containers**: Cloudflare Containers (`@cloudflare/containers`) for running match agent workload
- **Embeddings**: OpenRouter API (Qwen3 embedding model)
- **LLM chat**: DeepSeek API via OpenAI-compatible endpoint
- **Email**: Cloudflare Email Service (`send_email` binding)

## Project Structure

```
├── wrangler.toml              # Config: D1, KV, Vectorize, Queue, Cron, observability
├── src/
│   ├── index.ts               # Entry: Hono routes + scheduled() + queue()
│   ├── lib/
│   │   ├── types.ts           # All type definitions + Env bindings
│   │   ├── config.ts          # Config helper reading env bindings
│   │   ├── agent/
│   │   │   ├── index.ts       # Re-exports
│   │   │   ├── match_agent.ts # Vercel AI SDK agent: tool-based job matching (getPendingJobs / submitEvaluation)
│   │   │   └── match_agent.test.ts
│   │   ├── db/                # D1 CRUD (job_detail, user_info, user_matched_job, email_verification)
│   │   ├── llm/
│   │   │   ├── index.ts       # Old LLM helpers (OpenRouter chat)
│   │   │   └── embedding.ts   # OpenRouter embeddings
│   │   ├── crawler/
│   │   │   ├── index.ts       # Crawler registry
│   │   │   ├── remote_ok.ts   # RemoteOK scraper
│   │   │   └── weworkremotely.ts # WeWorkRemotely scraper
│   │   ├── email/
│   │   │   └── template.ts    # Email HTML/text templates
│   │   └── vectorize/
│   │       ├── index.ts       # Vectorize upsert/query helpers
│   │       └── mock.ts        # Mock Vectorize for testing
│   ├── container/
│   │   ├── server.ts          # HTTP server wrapping runMatchAgent for Container runtime
│   │   └── server.test.ts     # Integration tests for container server
│   ├── bot/
│   │   ├── bot.ts             # grammY setup + env middleware + command registration
│   │   ├── session.ts         # KV-backed chat session (10min TTL)
│   │   ├── constants.ts       # All Telegram reply texts
│   │   └── handlers/          # start, help, all_jobs, jobs, upload_resume, expectation
│   └── jobs/
│       ├── crawl.ts           # Fetch jobs from RemoteOK + WeWorkRemotely
│       ├── embed.ts           # Generate embeddings → store in Vectorize
│       ├── match.ts           # Vector search → AI agent (Vercel AI SDK) → store matches
│       ├── match.test.ts
│       ├── notify.ts          # Unnotified matches → Telegram API
│       └── notify.test.ts
└── migrations/
    └── 001_initial.sql        # D1 schema
```

## Flow

```
Cron (hourly)               ──▶  scheduled()  ──▶  JOBS_QUEUE.send({type, offset})
(crawl on even hours)       ──▶  JOBS_QUEUE.send({type: "crawl"})
(embed every hour)          ──▶  JOBS_QUEUE.send({type: "embed"})
(match/notify every 3 hrs)  ──▶  JOBS_QUEUE.send({type: "match", offset: i}) + notify

Telegram  ──▶  Hono POST /telegram/webhook  ──▶  grammY bot  ──▶  command handlers

Email verification:
  /email ──▶  prompt for address ──▶  create token in email_verification table
  ──▶  send verification email via Cloudflare Email Service
  ──▶  user clicks link ──▶  GET /verify-email?token=... ──▶  mark verified + update user_info.email

Email notification (in notify.ts):
  handleNotify ──▶  for each user with non-notified matches:
    ──▶  send Telegram message (if telegramId exists)
    ──▶  send email notification (if email is set)

MatchContainer (Cloudflare Containers):
  Container class with HTTP server  ──▶  POST /match  ──▶  runMatchAgent  ──▶  results JSON
```

## Commands

| Command | Description |
|---|---|
| `/start` | Start the bot |
| `/help` | Usage help |
| `/all_jobs` | Browse all available jobs (paginated) |
| `/jobs` | Browse your matched jobs (paginated) |
| `/upload_resume` | Upload your resume (text file) |
| `/expectation` | Set job expectations |
| `/email` | Set email address and verify for notifications |

## Deployment

```bash
# 1. Create D1 database
npx wrangler d1 create jd-matcher-db

# 2. Copy database_id from output into wrangler.toml

# 3. Run migration
npx wrangler d1 execute jd-matcher-db --file migrations/001_initial.sql

# 4. Create KV namespace
npx wrangler kv:namespace create "SESSION_KV"
# Copy id into wrangler.toml [[kv_namespaces]]

# 5. Create Vectorize indexes
npx wrangler vectorize create job-desc-embeddings --dimensions=1024 --metric=cosine
npx wrangler vectorize create resume-embeddings --dimensions=1024 --metric=cosine

# 6. Create the job queue
npx wrangler queue create jd-jobs-pool

# 7. Set secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put LLM_OPENROUTER_APIKEY
npx wrangler secret put LLM_DEEPSEEK_APIKEY

# 8. Run email verification migration
npx wrangler d1 execute jd-matcher-db --file migrations/002_email_verification.sql

# 9. Deploy
npx wrangler deploy

# 10. Set Telegram webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://jd-matcher.<subdomain>.workers.dev/telegram/webhook"
```

> Note: The MatchContainer uses Cloudflare Containers which require a Dockerfile. The container image is built and deployed automatically with `wrangler deploy`.

## Testing

```bash
npx vitest run            # Run all tests
npx vitest run --reporter=verbose  # Verbose output
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start wrangler dev server |
| `npm run dev:cron` | Dev server with test-scheduled flag |
| `npm run dev:db` | Apply migration to local D1 |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run test` | Run vitest tests |
| `npm run typecheck` | TypeScript type check |
