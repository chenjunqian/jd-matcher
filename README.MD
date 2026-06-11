# JD Matcher

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

JD Matcher is an intelligent job matching tool that leverages Large Language Model (LLM) capabilities to find the most suitable jobs based on user resumes and job descriptions. The project provides services through a Telegram bot, automatically crawling job listings and notifying users when matching positions are found.

## ✨ Features

- 🤖 **Intelligent Matching**: Uses LLM-based embeddings (OpenRouter) for vector representations and DeepSeek for semantic matching
- 📱 **Telegram Bot Integration**: grammY-powered bot with pagination, file upload, and inline keyboards
- 🕷️ **Automated Job Crawling**: Supports RemoteOK and WeWorkRemotely job sources with scheduled crawling
- 🔔 **Smart Notifications**: Automatically notifies users when matching jobs are found via Telegram and email
- 📧 **Email Verification**: Users can set and verify their email for email-based job notifications
- ⚡ **Cloud-Native**: Built on Cloudflare Workers with D1 database, Vectorize search, Queue-based async jobs, and Container-based agent runtime
- 🚀 **Fully Serverless**: No infrastructure to manage, auto-scaling with Containers for long-running workloads

## 🏗️ Architecture

```txt
jd-matcher/
├── src/
│   ├── index.ts               # Entry: Hono routes + scheduled() + queue()
│   ├── lib/
│   │   ├── types.ts           # All type definitions + Env bindings
│   │   ├── db/                # D1 CRUD (job_detail, user_info, user_matched_job, email_verification)
│   │   ├── llm/               # OpenRouter embeddings + DeepSeek chat + prompt
│   │   ├── crawler/           # RemoteOK + WeWorkRemotely scrapers
│   │   ├── email/             # Email HTML/text templates
│   │   └── vectorize/         # Vectorize upsert/query helpers
│   ├── container/
│   │   ├── server.ts          # HTTP server wrapping runMatchAgent for Container runtime
│   │   └── server.test.ts     # Integration tests
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
│       └── notify.ts          # Unnotified matches → Telegram + email
├── migrations/
│   ├── 001_initial.sql        # D1 schema
│   └── 002_email_verification.sql  # Email verification table
├── wrangler.toml              # Single config — D1, KV, Vectorize, Queue, Cron
├── package.json
└── tsconfig.json
```

## Flow

```
Cron        ──▶  scheduled()  ──▶  JOBS_QUEUE.send({type})  ──▶  queue() → dispatch
Telegram    ──▶  Hono POST /telegram/webhook  ──▶  grammY bot  ──▶  command handlers
Match agent ──▶  MatchContainer (Cloudflare Containers)  ──▶  runMatchAgent (Vercel AI SDK)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ (for local development)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npx wrangler`)
- Cloudflare account
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenRouter API Key
- DeepSeek API Key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/chenjunqian/jd-matcher.git
   cd jd-matcher
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Cloudflare resources**

   ```bash
   # Create D1 database
   npx wrangler d1 create jd-matcher-db

   # Copy the database_id from output into wrangler.toml

   # Run migration
   npx wrangler d1 execute jd-matcher-db --file migrations/001_initial.sql

   # Run email verification migration
   npx wrangler d1 execute jd-matcher-db --file migrations/002_email_verification.sql

   # Create KV namespace
   npx wrangler kv:namespace create "SESSION_KV"
   # Copy id into wrangler.toml [[kv_namespaces]]

   # Create Vectorize indexes
   npx wrangler vectorize create job-desc-embeddings --dimensions=1024 --metric=cosine
   npx wrangler vectorize create resume-embeddings --dimensions=1024 --metric=cosine

   # Create job queue
   npx wrangler queue create jd-jobs-pool
   ```

4. **Set secrets**

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put LLM_OPENROUTER_APIKEY
   npx wrangler secret put LLM_DEEPSEEK_APIKEY
   ```

5. **Deploy**

   ```bash
   npx wrangler deploy
   ```

   > **Note**: The `MatchContainer` requires a Dockerfile at the project root. The container image is built and deployed automatically with `wrangler deploy`.

6. **Set Telegram webhook**

   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://jd-matcher.<subdomain>.workers.dev/telegram/webhook"
   ```

### Local Development

```bash
# Start local dev server with bindings
npx wrangler dev

# Register webhook for local testing (requires tunnel)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-tunnel.ngrok.io/telegram/webhook"
```

## 📖 Usage

### Telegram Bot Commands

| Command | Description |
|---|---|
| `/start` | Start the bot |
| `/help` | Usage help |
| `/all_jobs` | Browse all available jobs (paginated) |
| `/jobs` | Browse your matched jobs (paginated) |
| `/upload_resume` | Upload your resume (text file) |
| `/expectation` | Set job expectations (location, salary, language, etc.) |
| `/email` | Set email address and verify for email notifications |

### How It Works

1. **Resume Upload**: Users upload their resumes as text files through the Telegram bot
2. **Vector Embedding**: Resumes are converted to vector representations using OpenRouter embeddings
3. **Job Crawling**: Cron triggers crawl jobs from RemoteOK and WeWorkRemotely every 2 hours
4. **Embedding Generation**: New jobs are embedded via Queue consumer and stored in Vectorize
5. **Matching**: Vector search finds similar jobs, then the AI agent (Vercel AI SDK) performs semantic ranking. The agent runs inside Cloudflare Containers (`MatchContainer`) to support long-running LLM calls.
6. **Notifications**: Users are notified via Telegram and/or email when matching jobs are found
7. **Email Verification**: Users can set their email via `/email` command, receive a verification link, and opt into email notifications

## 🛠️ Development

### Key Commands

```bash
npm run dev              # Start wrangler dev server
npm run dev:cron         # Dev server with test-scheduled flag
npm run deploy           # Deploy to Cloudflare Workers
npm run test             # Run vitest tests
npm run typecheck        # TypeScript type check
```

### Adding New Job Sources

1. Create a new crawler file in `src/lib/crawler/`
2. Export the fetch function
3. Add it to the crawl pipeline in `src/jobs/crawl.ts`

### Adding New LLM Providers

1. Add the provider client in `src/lib/llm/`
2. Add environment variables to `src/lib/types.ts` `Env` interface
3. Add the API call to the appropriate job handler

### Adding New Bot Commands

1. Add handler in `src/bot/handlers/`
2. Register in `src/bot/bot.ts` with `bot.command()`
3. Add reply text to `src/bot/constants.ts`

## 🧪 Testing

```bash
npx vitest run            # Run all tests
npx vitest run --reporter=verbose  # Verbose output

# Type checking
npm run typecheck
```

## 📊 Configuration

### Environment Variables (Secrets)

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `LLM_OPENROUTER_APIKEY` | Yes | OpenRouter API key for embeddings |
| `LLM_DEEPSEEK_APIKEY` | Yes | DeepSeek API key for job matching |

### Cloudflare Bindings

| Binding | Type | Description |
|---|---|---|
| `EMAIL` | `send_email` | Cloudflare Email Service for sending verification and notification emails |

### Configuration Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_URL` | Yes | — | Public app URL for email verification links (e.g. `https://jdmatcher.guoshaotech.com`) |

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_OPENROUTER_BASEURL` | `https://openrouter.ai/api/v1` | OpenRouter API endpoint |
| `LLM_OPENROUTER_MODEL` | `deepseek/deepseek-v3.2` | Chat model for OpenRouter |
| `LLM_OPENROUTER_EMBEDDINGMODEL` | `qwen/qwen3-embedding-8b` | Embedding model |
| `LLM_DEEPSEEK_BASEURL` | `https://api.deepseek.com/v1` | DeepSeek API endpoint |
| `LLM_DEEPSEEK_MODEL` | `deepseek-v4-flash` | DeepSeek chat model |
| `LLM_DEEPSEEK_REASONINGEFFORT` | `high` | DeepSeek reasoning effort |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com) - Serverless compute platform
- [Hono](https://hono.dev) - Lightweight web framework
- [grammY](https://grammy.dev) - Telegram bot framework
- [OpenRouter](https://openrouter.ai) - Unified LLM API gateway
- [DeepSeek](https://deepseek.com) - LLM provider
- [RemoteOK](https://remoteok.com) - Remote job board
- [WeWorkRemotely](https://weworkremotely.com) - Remote job board

## 📞 Support

If you have any questions or issues, please:
1. Check the [Issues](https://github.com/chenjunqian/jd-matcher/issues) page
2. Create a new issue if needed

---

⭐ If this project helps you, please give it a star!
