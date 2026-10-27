# JD Matcher

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://typescriptlang.org)
[![AI Agent Skill](https://img.shields.io/badge/AI_Agent_Skill-Cross--Platform-8A2BE2.svg)](skills/jd-matcher-skill/SKILL.md)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**JD Matcher** is an intelligent remote job discovery and evaluation engine that pairs candidate backgrounds with live job postings using Large Language Models (LLMs).

It offers two distinct operation modes:
1. 🌟 **AI Agent Skill (Recommended)**: A local-first, database-free, privacy-preserving workflow for your AI Agent (Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor). Crawls jobs into a structured Markdown knowledge base, filters opportunities via filesystem search, applies strict veto gates, and delivers match recommendations in an interactive **frosted-glass** visual dashboard.
2. ☁️ **Cloudflare Serverless Daemon**: An automated 24/7 background cloud stack (Cloudflare Workers, D1 SQLite, Vectorize, Cloudflare Containers, and Queues) with proactive Telegram bot alerts and email notifications.

---

## ⚡ Quick Comparison: Which Mode Should You Use?

| Feature | 🌟 AI Agent Skill (`jd-matcher-skill`) | ☁️ Serverless Cloud Worker |
|---|---|---|
| **Best For** | **Daily interactive job search & deep evaluations** | **24/7 automated continuous background monitoring** |
| **Setup Cost** | **Zero cloud setup** (Node.js >= 22 or Bun) | Requires Cloudflare D1, KV, Vectorize, Queues, Telegram token |
| **Data Privacy** | **100% Local & Private** (PII strictly git-ignored) | Resume & data stored in Cloudflare D1 & Vectorize |
| **User Interface** | **Frosted-Glass Interactive HTML Dashboard** (auto-opens in browser) | Telegram Bot (`@your_bot`) + Email notifications |
| **Supported AI Agents** | Google Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor | Standalone cloud service (Vercel AI SDK inside Container) |
| **Database Required** | **None** (Markdown Knowledge Base + `find`/`grep`) | Cloudflare D1 + Vectorize |

---

## 🌟 Recommended: Use as an AI Agent Skill (`jd-matcher-skill`)

The primary way to use JD Matcher is through its built-in **Agent Skill**. You don't need to deploy servers, manage databases, or configure webhooks. Just talk to your AI Agent!

### Why Use the Skill?
- **Universal Agent Support**: One-command installer (`scripts/install-skill.sh`) links the skill into `.agents/skills/`, `.claude/skills/`, `~/.gemini/skills/`, `~/.config/opencode/skills/`, `~/.pi/agent/skills/` and more, so Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor and Gemini CLI all discover it instantly.
- **Glean-Inspired Knowledge Base**: Job postings from RemoteOK and WeWorkRemotely are stored as structured, date-partitioned Markdown files (`data/jds/<YYYY>/<MM>/`).
- **Two-Stage Fast Retrieval**: Native filesystem search inspects the last 2 months of postings in milliseconds without vector databases.
- **Hard Constraints Gate**: Strict single-veto enforcement (e.g. immediately rejects US-only jobs for worldwide candidates, rejects below-floor salaries, etc.).
- **Frosted-Glass Visual Dashboard**: Visualizes your top matches, vetoed listings, and full crawled inventory in a glassmorphism workbench (icon rail, lime/apricot/ink bento cards, activity chart, signal ring) with a light `Frost` and dark `Ink` theme.

---

### 🤖 How to Use in Your AI Agent

#### 1. Installation

Two ways to install — ask your AI Agent, or run the installer yourself. Both support **this project only** and **global (all projects, all agents)** scope. No extra dependencies are required.

**Option A — Let your AI Agent install it** (works in Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor):

```markdown
"Install the jd-matcher skill for me — use the project or global scope that fits, register it for all my AI agents, and verify it is discoverable."
```

The agent finds `scripts/install-skill.sh`, picks the right scope, runs it, and confirms the skill shows up in `/skill:` discovery.

**Option B — Run the installer yourself**

```bash
# Interactive: choose this project / global / both, then confirm
bash scripts/install-skill.sh

# Global install for every AI agent detected on this machine
bash scripts/install-skill.sh --scope global

# This repository only (.agents/skills + .claude/skills)
bash scripts/install-skill.sh --scope local

# Copy instead of symlink (Windows, cloud agents, read-only repos) + the Kami design skill
bash scripts/install-skill.sh --scope global --copy --with-kami

# Inspect / roll back
bash scripts/install-skill.sh --list
bash scripts/install-skill.sh --scope global --dry-run
bash scripts/install-skill.sh --scope global --uninstall
```

| Flag | Meaning |
|---|---|
| `--scope local\|global\|both` | Install into this repository, or into user-level agent directories |
| `--target <name>[,...]`, `--target all` | Limit to specific agents: `agents`, `claude`, `codex`, `cursor`, `gemini`, `antigravity`, `opencode`, `pi` |
| `--with-kami` | Also install the bundled `kami` design skill |
| `--copy` | Copy files instead of symlinking (needed on Windows / for cloud agents) |
| `--force` | Replace a same-named skill that was installed by hand |
| `--dry-run` / `--uninstall` / `--list` | Preview, remove, or inspect installations |

Installed locations:

| Scope | Path | Agents |
|---|---|---|
| Project | `.agents/skills/` | Antigravity, OpenCode, Codex, Pi, Cursor, Gemini CLI |
| Project | `.claude/skills/` | Claude Code |
| Global | `~/.agents/skills/` | Cross-client convention (all of the above) |
| Global | `~/.claude/skills/` | Claude Code |
| Global | `~/.config/opencode/skills/` | OpenCode |
| Global | `~/.gemini/skills/` | Gemini CLI |
| Global | `~/.gemini/config/skills/` | Google Antigravity |
| Global | `~/.cursor/skills/` | Cursor |
| Global | `~/.codex/skills/` | Codex CLI |
| Global | `~/.pi/agent/skills/` | Pi |

> **Symlink (default) vs `--copy`**: symlinks keep a single source of truth, so `git pull` updates every installed agent instantly. `--copy` snapshots the skill — re-run the installer after pulling. The installer never overwrites a skill it did not create unless you pass `--force`, and `--uninstall` only removes links/copies it made.
>
> **Where does my data go?** The skill writes its knowledge base (`data/jds/`, `data/profile/`, `data/matches/`) relative to the folder your agent is working in. A global install therefore still keeps every project's jobs and resume data separate.

#### 2. Compatibility
The canonical skill lives at [`skills/jd-matcher-skill`](skills/jd-matcher-skill) and is symlinked into standard agent discovery paths by the installer:
- `.agents/skills/jd-matcher-skill` (Antigravity, OpenCode, Codex, Pi, Cursor, Gemini CLI)
- `.claude/skills/jd-matcher-skill` (Claude Code)

Clone-and-go: these two symlinks are already committed, so agents discover the skill immediately after a fresh `git clone`. Use the installer when you want it available **globally** or in the additional agent directories (`.cursor/`, `.gemini/`, `.opencode/`).

#### 3. First-Time Setup (Onboarding)
Before matching, ensure your candidate profile is ready under `data/profile/`:

- `data/profile/resume.md`: Your technical background, core skills, years of experience, and project impact.
- `data/profile/expectations.md`: Hard constraints (100% remote, timezone preferences, salary floor, target titles) and preferences.

> **💡 Proactive Onboarding**: If you haven't filled these out yet, simply tell your AI Agent! When you ask it to match jobs, the agent will detect missing profile data, pause, and guide you through setting them up interactively in chat or scaffold them from the tracked reference templates:
> - Resume Example: [`data/profile/resume.example.md`](data/profile/resume.example.md)
> - Expectations Example: [`data/profile/expectations.example.md`](data/profile/expectations.example.md)
>
> *(Note: `data/profile/resume.md` and `expectations.md` are strictly `.gitignore`d to prevent accidental leakage of personal info!)*

#### 4. Agent Prompts
Simply instruct your AI Agent in natural language:

```markdown
"Find the latest remote jobs for me and match them against my resume."
```
```markdown
"Crawl recent postings from RemoteOK and WeWorkRemotely, filter the last 2 months, and show me the top matches."
```
```markdown
"Evaluate available backend engineering opportunities against my expectations and open the visual dashboard."
```

#### 5. What the Agent Does Automatically
```
1. Profile Check    ──▶  Verifies resume.md & expectations.md (prompts user if missing)
2. Crawl & Ingest   ──▶  Runs crawl script to fetch fresh listings into data/jds/
3. Filter & Gate    ──▶  Fast-retrieves 2-month opportunities & applies hard veto gates
4. Deep Scoring     ──▶  Evaluates skill alignment (0-10) with detailed reasoning & tips
5. Visual Dashboard ──▶  Generates data/matches/dashboard.html & opens it in your browser!
```

---

### 💻 Manual CLI Usage (Optional)

You can also run the underlying TypeScript scripts directly using Node.js (>= 22.6) or Bun without third-party dependencies:

```bash
# 1. Crawl latest 30 remote jobs from RemoteOK and WeWorkRemotely
node skills/jd-matcher-skill/scripts/crawl.ts --limit 30

# 2. Fast-filter postings within the last 2 months by tech tags or keywords
node skills/jd-matcher-skill/scripts/search.ts --months 2 --tags typescript,react,fullstack
node skills/jd-matcher-skill/scripts/search.ts --months 2 --keywords backend,golang,api

# 3. Generate the frosted-glass HTML dashboard and open in browser
node skills/jd-matcher-skill/scripts/dashboard.ts --open
```

---

## 🎨 Visual Dashboard & Frosted Workbench Design System

Matches and crawled inventory are rendered into [`data/matches/dashboard.html`](data/matches/dashboard.html). By default, the dashboard adheres to the **Kami (`紙`)** editorial design system:

- **Frosted Glass Surfaces**: Warm neutral canvas (`#EFEDE9`) with soft lime/apricot gradient blooms, translucent blur panels and hairline borders.
- **Neo-Grotesque Typography**: A single sans stack with tight-tracked display headings, tabular numerals, and tiny uppercase labels.
- **Signal Colors**: Chartreuse lime (`#F2EA2E`), apricot (`#FE9251`) and ink black (`#0D0D0D`) accent cards, plus an electric blue for secondary tiers.
- **Icon Rail + Bento**: Sticky frosted icon rail for the four sections, a 12-column bento of KPI/spotlight cards, per-run activity chart and conviction ring.
- **Interactive Features**: Client-side search, score/source filters and reset, expandable long-form analysis, per-run history bars, and light/dark (`Frost`/`Ink`) themes persisted in `localStorage`.

---

## ☁️ Cloudflare Serverless Deployment (Telegram Bot Mode)

If you need a 24/7 background cloud daemon that runs scheduled hourly crons, vectorizes job descriptions with Cloudflare Vectorize, and sends real-time Telegram and email notifications, you can deploy the Cloudflare Workers stack.

### 🏗️ Cloud Architecture

```txt
jd-matcher/
├── src/
│   ├── index.ts               # Entry: Hono routes + scheduled() + queue()
│   ├── lib/
│   │   ├── types.ts           # Type definitions + Env bindings
│   │   ├── db/                # D1 CRUD (job_detail, user_info, user_matched_job, email_verification)
│   │   ├── llm/               # OpenRouter embeddings + DeepSeek chat
│   │   ├── crawler/           # RemoteOK + WeWorkRemotely scrapers
│   │   ├── email/             # Email HTML/text templates
│   │   └── vectorize/         # Vectorize upsert/query helpers
│   ├── container/
│   │   ├── server.ts          # HTTP server wrapping runMatchAgent for Cloudflare Containers
│   │   └── server.test.ts     # Integration tests
│   ├── bot/
│   │   ├── bot.ts             # grammY setup + command registration
│   │   ├── session.ts         # KV-backed chat session (10min TTL)
│   │   ├── constants.ts       # Telegram reply texts
│   │   └── handlers/          # start, help, all_jobs, jobs, upload_resume, expectation
│   └── jobs/
│       ├── crawl.ts           # Fetch jobs from RemoteOK + WeWorkRemotely
│       ├── embed.ts           # Generate embeddings → store in Vectorize
│       ├── match.ts           # Vector search → AI agent (Vercel AI SDK) → store matches
│       └── notify.ts          # Unnotified matches → Telegram + email
├── migrations/
│   ├── 001_initial.sql        # D1 schema
│   └── 002_email_verification.sql
├── wrangler.toml              # D1, KV, Vectorize, Queue, Cron config
```

### Cloud Flow

```
Cron (hourly) ──▶ scheduled() ──▶ JOBS_QUEUE.send({type}) ──▶ queue() → dispatch
Telegram      ──▶ Hono POST /telegram/webhook ──▶ grammY bot ──▶ command handlers
Match agent   ──▶ MatchContainer (Cloudflare Containers) ──▶ runMatchAgent (Vercel AI SDK)
```

### Cloud Prerequisites
- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npx wrangler`)
- Cloudflare account with Workers, D1, KV, Vectorize, and Queues enabled
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenRouter API Key & DeepSeek API Key

### Deploying to Cloudflare

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Cloudflare resources**
   ```bash
   # Create D1 database
   npx wrangler d1 create jd-matcher-db
   # (Copy database_id into wrangler.toml)

   # Run migrations
   npx wrangler d1 execute jd-matcher-db --file migrations/001_initial.sql
   npx wrangler d1 execute jd-matcher-db --file migrations/002_email_verification.sql

   # Create KV namespace
   npx wrangler kv:namespace create "SESSION_KV"
   # (Copy id into wrangler.toml [[kv_namespaces]])

   # Create Vectorize indexes
   npx wrangler vectorize create job-desc-embeddings --dimensions=1024 --metric=cosine
   npx wrangler vectorize create resume-embeddings --dimensions=1024 --metric=cosine

   # Create job queue
   npx wrangler queue create jd-jobs-pool
   ```

3. **Configure Secrets**
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put LLM_OPENROUTER_APIKEY
   npx wrangler secret put LLM_DEEPSEEK_APIKEY
   ```

4. **Deploy & Set Webhook**
   ```bash
   npx wrangler deploy

   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://jd-matcher.<subdomain>.workers.dev/telegram/webhook"
   ```

### Telegram Bot Commands

| Command | Description |
|---|---|
| `/start` | Start the bot |
| `/help` | Usage help |
| `/all_jobs` | Browse all available jobs (paginated) |
| `/jobs` | Browse your matched jobs (paginated) |
| `/upload_resume` | Upload your resume (text file) |
| `/expectation` | Set job expectations (location, salary, language) |
| `/email` | Set and verify email address for job alerts |

---

## 🛠️ Development & Testing

```bash
# Run all unit and integration tests (including skill tests)
npx vitest run

# Run skill-specific tests
npx vitest run skills/jd-matcher-skill/scripts/skill.test.ts

# TypeScript typecheck
npm run typecheck

# Start local worker dev server
npm run dev
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Kami (`紙`)](https://github.com/tw93/kami) - Craft document and dashboard typography & design system
- [Cloudflare Workers](https://workers.cloudflare.com) - Serverless compute platform
- [Hono](https://hono.dev) - High-performance web framework
- [grammY](https://grammy.dev) - Telegram bot framework
- [Vercel AI SDK](https://sdk.vercel.ai) - Agent orchestration
- [RemoteOK](https://remoteok.com) & [WeWorkRemotely](https://weworkremotely.com) - Remote job feeds
