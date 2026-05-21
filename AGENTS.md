# JD Matcher — Cloudflare Workers

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Web framework**: Hono.js
- **Bot library**: grammY
- **Database**: D1 (SQLite)
- **Vector search**: Cloudflare Vectorize
- **Session state**: Cloudflare KV
- **Async jobs**: Cloudflare Queues
- **Cron triggers**: 3 schedules, all enqueue to the job queue

## Project Structure

```
├── wrangler.toml              # Single config — D1, KV, Vectorize, Queue, Cron
├── src/
│   ├── index.ts               # Entry: Hono routes + scheduled() + queue()
│   ├── lib/
│   │   ├── types.ts           # All type definitions + Env bindings
│   │   ├── db/                # D1 CRUD (job_detail, user_info, user_matched_job)
│   │   ├── llm/               # OpenRouter embeddings + DeepSeek chat + prompt
│   │   ├── crawler/           # RemoteOK + WeWorkRemotely scrapers
│   │   └── vectorize/         # Vectorize upsert/query helpers
│   ├── bot/
│   │   ├── bot.ts             # grammY setup + env middleware + command registration
│   │   ├── session.ts         # KV-backed chat session (10min TTL)
│   │   ├── constants.ts       # All Telegram reply texts
│   │   └── handlers/          # start, help, all_jobs, jobs, upload_resume, expectation
│   └── jobs/
│       ├── crawl.ts           # Fetch jobs from RemoteOK + WeWorkRemotely
│       ├── embed.ts           # Generate embeddings → store in Vectorize
│       ├── match.ts           # Vector search → DeepSeek → store matches
│       └── notify.ts          # Unnotified matches → Telegram API
└── migrations/
    └── 001_initial.sql        # D1 schema
```

## Flow

```
Cron        ──▶  scheduled()  ──▶  JOBS_QUEUE.send({type})  ──▶  queue() → dispatch
Telegram    ──▶  Hono POST /webhook  ──▶  grammY bot  ──▶  command handlers
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

# 8. Deploy
npx wrangler deploy

# 9. Set Telegram webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://jd-matcher.<subdomain>.workers.dev/webhook"
```
