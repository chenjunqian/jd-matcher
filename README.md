# JD Matcher

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://typescriptlang.org)
[![AI Agent Skill](https://img.shields.io/badge/AI_Agent_Skill-Cross--Platform-8A2BE2.svg)](skills/jd-matcher-skill/SKILL.md)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**JD Matcher** is an intelligent remote job discovery and evaluation engine that pairs candidate backgrounds with live job postings using Large Language Models (LLMs).

## 🚀 Install in one prompt

No manual clone, no database, no cloud account. Paste this into **Claude Code, Codex, Cursor, Gemini CLI, Pi, OpenCode** or any agent that can browse a repository:

```text
Install the jd-matcher skill for me from https://github.com/chenjunqian/jd-matcher
Follow the repo's INSTALL.md, then tell me where it was installed and how to start.
```

The agent clones the repository to a stable location, registers the skill for every supported agent, verifies that it is discoverable, and tells you how to run the first job search. Requirements: Node.js >= 22.6 (or Bun) and `git`. Full agent-facing steps live in [`INSTALL.md`](INSTALL.md).

---

## Two ways to run it

1. 🌟 **AI Agent Skill (recommended, supported)**: A local-first, database-free, privacy-preserving workflow for your AI Agent (Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor). Crawls jobs into a structured Markdown knowledge base, filters opportunities via filesystem search, applies strict veto gates, and delivers match recommendations in an interactive **frosted-glass** visual dashboard.
2. ☁️ **Hosted Telegram bot (legacy)**: The hosted Cloudflare stack (Workers, D1, Vectorize, Containers, Queues) still runs for existing users, but it is no longer the recommended entry point. New users should start with the skill above.

---

## ⚡ Quick Comparison: Which Mode Should You Use?

| Feature | 🌟 AI Agent Skill (`jd-matcher-skill`) | ☁️ Hosted Stack (legacy) |
|---|---|---|
| **Best For** | **Daily interactive job search & deep evaluations** | Existing bot users; **not recommended for new setups** |
| **Install** | **One prompt** (see above) | Existing Cloudflare deployment only |
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

Three ways to install, from least to most manual. All of them end with the skill registered in the agent's global skill directory; no extra dependencies are required.

**Option A — Paste one prompt (recommended, no manual clone)** — works in Antigravity, Claude Code, OpenCode, Codex, Pi, Cursor and any agent that can browse a repository:

```text
Install the jd-matcher skill for me from https://github.com/chenjunqian/jd-matcher
Follow the repo's INSTALL.md, then tell me where it was installed and how to start.
```

The agent reads [`INSTALL.md`](INSTALL.md), clones the repository to a stable location (`~/.local/share/jd-matcher` on Linux/macOS), runs `scripts/install-skill.sh --scope global --target all`, verifies that `SKILL.md` is readable from at least one agent directory, and reports the result. It never needs `sudo` and never modifies your existing data.

**Option B — Run the installer yourself from a clone**

```bash
git clone --depth 1 https://github.com/chenjunqian/jd-matcher.git ~/.local/share/jd-matcher
cd ~/.local/share/jd-matcher
bash scripts/install-skill.sh --scope global --target all
```

Use a stable path, not `/tmp`: the default symlink install points the agents at this checkout, so a scratch directory leaves broken links. The installer warns when it detects a temporary checkout.

**Option C — Manual CLI flags**

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

## ☁️ Hosted Telegram Bot (Cloudflare)

> **Status:** the hosted bot is still online for existing users. It is **not** the recommended entry point for new users — install the [skill above](#-install-in-one-prompt) instead. This section documents the existing deployment and is kept for maintenance.

The hosted stack runs scheduled hourly crons, vectorizes job descriptions with Cloudflare Vectorize, and sends Telegram and email notifications. If you are extending an existing deployment, the architecture and deploy steps are below.

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
