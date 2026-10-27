---
name: jd-matcher-skill
description: >-
  Crawl latest remote jobs into a local Glean-inspired Markdown knowledge base,
  filter recent 2-month opportunities via file system search (find/grep),
  prioritize fresh un-evaluated jobs while excluding already matched/rejected opportunities,
  and evaluate candidate resume and expectations to provide tailored job recommendations.
  Presents matched results in an interactive frosted-glass (glassmorphism) HTML dashboard that
  accumulates the full evaluation history across every dated report (incl. `archive/`).
  Use when the user wants to fetch latest remote jobs, match remote jobs with their resume,
  or search and recommend job openings locally.
---

# JD Matcher Skill

This skill provides a local-first, database-free, and serverless-free workflow for discovering and matching remote jobs.
Job postings are archived as structured Markdown knowledge base files in the local filesystem, enabling rapid two-stage retrieval via native date-partitioned directories, `find`, and `grep`, with automatic detection and exclusion of already-evaluated jobs, followed by deep AI semantic evaluation against candidate profile constraints.

Results are presented in an interactive visual dashboard styled as the **Frosted Workbench** — a glassmorphism system with an icon rail, lime/apricot/ink accent cards and frosted glass surfaces.

---

## Runtime Requirements

- **Node.js**: >= 22.6.0 (supports direct TypeScript execution natively)
- **or Bun**: >= 1.0 (supports TypeScript out of the box)

---

## Installation

When the user asks to install this skill (project-local or global), run the installer from the repository root:

```bash
bash scripts/install-skill.sh                              # interactive scope prompt
bash scripts/install-skill.sh --scope global               # all detected AI agents, user-level
bash scripts/install-skill.sh --scope local                # this repository only
bash scripts/install-skill.sh --scope global --copy        # copy instead of symlink (Windows / cloud agents)
bash scripts/install-skill.sh --scope global --uninstall    # remove
```

Useful flags: `--target <agents,claude,codex,cursor,gemini,antigravity,opencode,pi|all>`, `--with-kami`, `--force`, `--dry-run`, `--list`. Symlinks are the default so `git pull` updates the installed skill everywhere; with `--copy` the installer must be re-run after each pull. The installer refuses to overwrite a skill it did not create unless `--force` is given. See [`README.md`](../../README.md#1-installation) for the full location table.

---

## Knowledge Base Directory Layout

```
data/
├── jds/                              # Job descriptions knowledge base (partitioned by YYYY/MM)
│   ├── .gitkeep
│   ├── 2026/
│   │   ├── 09/
│   │   │   └── wwr-glean-application-security-engineer.md
│   │   └── 10/
│   │       └── rok-1137475-lemonio-senior-react-full-stack-develope.md
├── profile/                          # Candidate profile
│   ├── .gitkeep
│   ├── resume.example.md             # Tracked reference template
│   ├── expectations.example.md       # Tracked reference template
│   ├── resume.md                     # Candidate resume (git-ignored, private)
│   └── expectations.md               # Preferences and hard constraints (git-ignored, private)
└── matches/                          # Recommendation reports and visual dashboard
    ├── .gitkeep
    ├── sample-report.example.md      # Tracked reference sample report
    ├── archive/                      # Older dated reports (still aggregated by the dashboard)
    │   └── YYYY-MM-DD-report.md
    ├── dashboard.html                # Frosted-glass interactive dashboard (git-ignored)
    ├── data.json / data.js           # Dynamic data bundle for dashboard (git-ignored)
    └── YYYY-MM-DD-report.md          # AI-generated recommendation report (git-ignored)
                                      # same-day reruns add a suffix: YYYY-MM-DD-report-HHMM.md
```

---

## Git Hygiene & Privacy (`.gitignore`)

To ensure privacy and avoid repository bloat:
- **Candidate PII Protected**: `data/profile/resume.md` and `data/profile/expectations.md` are strictly ignored by `.gitignore` so personal work history, salary expectations, and contact details are never accidentally committed.
- **Scraped Data Ignored**: `data/jds/*` is ignored by `.gitignore` to prevent committing thousands of scraped markdown documents.
- **Dynamic Match Outputs Ignored**: `data/matches/*.html`, `data.json`, `data.js`, and user-specific match reports are ignored by `.gitignore`.
- **Reference Templates Preserved**: `.gitkeep` and `*.example.md` files (`resume.example.md`, `expectations.example.md`, `sample-report.example.md`) are tracked in git so any clone starts with complete directory scaffolding and clear examples.

---

## Agent Standard Workflow

When the user asks to **"fetch latest remote jobs"**, **"match remote jobs with my resume"**, or **"find suitable job openings for me"**, follow these 5 steps:

### Step 1: First-Time User Onboarding & Profile Pre-flight Check

Before running any searches or evaluations, the AI Agent **must verify candidate profile availability**:

1. **Inspect Profile Files**:
   Check if `data/profile/resume.md` and `data/profile/expectations.md` exist and contain substantive candidate information (not empty and not untouched placeholders like `[Candidate Name]`).
2. **Proactive Prompt for First-Time Users**:
   If either file is missing, empty, or uncustomized:
   - **DO NOT proceed with matching immediately.**
   - Politely and proactively prompt the user to provide their resume and job expectations:
     - **Resume**: Primary tech stack (languages, frameworks, databases, cloud tools), years of experience, notable project achievements with quantifiable impact, and target job titles.
     - **Job Expectations**:
       - *Hard Constraints (Strict Veto)*: 100% remote requirement, geographic or timezone restrictions (e.g., Worldwide, APAC/EMEA friendly, reject US-only restrictions), target role titles, minimum salary floor (e.g., $60,000 USD/year).
       - *Strong Preferences*: Preferred tech stack (e.g. TypeScript, Go, React), company culture (async-first, craftsmanship), industry domain (DevTools, AI, SaaS).
   - **Assist the User**: Offer two easy setup options:
     - **Option A (Interactive Chat)**: User pastes their background or answers questions in chat; the AI Agent writes structured `data/profile/resume.md` and `data/profile/expectations.md` files for them.
     - **Option B (Self-Edit)**: User copies `data/profile/resume.example.md` to `resume.md` and `data/profile/expectations.example.md` to `expectations.md` and fills them out in their editor.
3. Once the user confirms their profile, proceed to Step 2.

### Step 2: Crawl & Ingest Latest Jobs (Crawl & Ingest)

Run the crawler script to fetch all types of remote opportunities (Software Development, Customer Support, Design, Marketing, Sales, Product, Operations, Finance, etc.) across 6 top remote platforms (**RemoteOK**, **WeWorkRemotely**, **Remotive**, **Jobspresso**, **Working Nomads**, and **NoDesk**), automatically saving them as date-partitioned Markdown files under `data/jds/<YYYY>/<MM>/`:

```bash
# Crawl latest 30 jobs across all 6 sources (automatic deduplication)
# Talent-agency / freelance-marketplace postings (Proxify, Lemon.io, Toptal, …)
# are filtered out automatically — see "Agency & Marketplace Filtering" below.
node skills/jd-matcher-skill/scripts/crawl.ts --limit 30

# Or target a specific source:
# remoteok | weworkremotely | remotive | jobspresso | workingnomads | nodesk
node skills/jd-matcher-skill/scripts/crawl.ts --source remotive --limit 30
node skills/jd-matcher-skill/scripts/crawl.ts --source jobspresso --limit 20
node skills/jd-matcher-skill/scripts/crawl.ts --source workingnomads --limit 30
node skills/jd-matcher-skill/scripts/crawl.ts --source nodesk --limit 20
```

### Step 3: Two-Stage Fast Retrieval & Filtering (Retrieve & Filter)

Filter for fresh opportunities posted within the **last 2 months** matching the candidate's core tech stack and role titles.
The retrieval engine scans every past match report in `data/matches/` **recursively (including `archive/`)**, tags job evaluation status (`🟢 New`, `⚪ Matched`, `❌ Rejected`), and **excludes already-evaluated jobs by default** so the same opportunity is never re-evaluated or re-recommended:

```bash
# Canonical matching query: last 2 months, exclude jobs already matched/rejected
node skills/jd-matcher-skill/scripts/search.ts --months 2 --tags typescript,react,fullstack --exclude-matched --limit 15

# Or filter by keywords and role titles while excluding past evaluations
node skills/jd-matcher-skill/scripts/search.ts --months 2 --keywords backend,golang,api --exclude-matched --limit 15

# Only when the candidate explicitly wants a full re-scan (incl. previous matches):
node skills/jd-matcher-skill/scripts/search.ts --months 2 --tags typescript,react,fullstack --include-matched --limit 15
```

> **Matching rule**: for matching runs, always prefer `--exclude-matched` (or `--unmatched-only`). Jobs already recorded in any report (top-level or `archive/`) MUST NOT be evaluated again unless the candidate has updated their resume/expectations or explicitly asks to revisit them.

> **Agency rule**: talent-agency / freelance-marketplace postings are dropped automatically (see [Agency & Marketplace Filtering](#agency--marketplace-filtering)). They are never evaluated or re-recommended, so the retirement of these platforms from the candidate's search never needs manual bookkeeping.

### Step 4: AI Agent Deep Evaluation & Scoring (Evaluate)

Follow the evaluation rubric: [evaluation-rubric.md](./references/evaluation-rubric.md).

1. **Prioritize Unmatched Opportunities**:
   - **Receive only fresh jobs**: The Step 3 query should already pass `--exclude-matched`, so every JD handed to evaluation is either fresh or explicitly requested.
   - **Focus on Fresh Opportunities**: Prioritize JDs labeled `🟢 New` that have not been evaluated before.
   - **Ignore Already Evaluated Jobs**: For JDs already evaluated in past reports (`⚪ Matched` or `❌ Rejected`), **skip and ignore them** unless the candidate has explicitly updated their resume or relaxed their hard constraints. If such a job is filtered out by the search script, respect that and do not re-add it manually. This prevents redundant token consumption and avoids re-recommending duplicate jobs to the user.
2. **Hard Constraints Gate (Strict Veto)**:
   - Check if each new JD violates any requirement in `data/profile/expectations.md` (e.g., US-only citizenship, non-remote requirement, insufficient salary floor). Immediately reject non-compliant jobs and record the rejection reason.
3. **Deep Fit Scoring (0-10 Scale)**:
   - For JDs passing the hard gate, read the full Markdown file using the `view_file` tool and evaluate fit:
     - **9.0 - 10.0**: Outstanding match (core stack, seniority, and domain all align strongly). Top recommendation.
     - **7.0 - 8.9**: Good fit (majority of core requirements met, minor gaps). Recommended for application.
     - **6.0 - 6.9**: Acceptable (meets minimum qualifications, notable gaps exist). Borderline.
     - **< 6.0**: Below threshold. Exclude from recommendation.

### Step 5: Generate Report & Launch Visual Dashboard (Report & Dashboard)

1. **Append Match Report (never overwrite history)**:
   Compile all recommendations scoring >= 6.0 into a structured report saved to `data/matches/YYYY-MM-DD-report.md`.
   - **Never overwrite or delete an existing report.** If a report for today already exists, write the new one with an `-HHMM` suffix instead: `data/matches/YYYY-MM-DD-report-1615.md`.
   - **Never move/rename reports out of the aggregation path** unless you place them under `data/matches/archive/` — the dashboard reads that folder too.
   - Every report is cumulative history: prior recommendations are never rewritten, only appended to with a new dated file.
2. **Generate Frosted-Glass Visual Dashboard**:
   Run the dashboard builder script:
   ```bash
   node skills/jd-matcher-skill/scripts/dashboard.ts --open
   ```
   This regenerates `data/matches/dashboard.html` (along with `data.json` and `data.js`) adhering to the **Frosted Workbench** design system and opens it in the user's default browser (`xdg-open` on Linux, `open` on macOS). The bundle aggregates **all** reports recursively (top-level + `archive/`), deduplicates jobs across runs (newest evaluation wins) and keeps the per-report evaluation history.
3. **Present Chat Summary**:
   Provide a concise executive summary in the active chat session:
   - **Role Title & Company**
   - **Original Application URL**
   - **Match Score**
   - **Why Match**: Key technical and experiential alignments.
   - **Skill Gaps & Application Tips**: Strategic tailoring advice.

---

## Agency & Marketplace Filtering

**Talent-agency and freelance-marketplace platforms are not employers.** They pool engineers into a talent network and place them on client projects (hourly / contract / project based), and their region rules commonly exclude the candidate (CET ± 3h, North America only, or a country allow-list that omits China Mainland). Evaluating them wastes tokens and produces repeat vetoes.

The skill therefore ships a curated blocklist in `scripts/agency_blocklist.ts` and filters these postings **at both ends**:

| Stage | Behaviour |
|---|---|
| `crawl.ts` | Agency postings are never written into `data/jds/**` (logged as `🚫 Skipped agency posting` and counted as `Filtered (agency)` in the summary). |
| `search.ts` | Existing agency JDs already in the KB are skipped before evaluation and reported as `🚫 N agency-marketplace job(s) filtered` plus a per-platform appendix. |

**Platforms blocked by default:**

| Key | Platform | Key | Platform |
|---|---|---|---|
| `proxify` | Proxify | `braintrust` | Braintrust |
| `lemon-io` | Lemon.io | `arc-dev` | Arc.dev |
| `toptal` | Toptal | `crossover` | Crossover |
| `a-team` | A.Team | `upwork` | Upwork |
| `x-team` | X-Team | `freelancer` | Freelancer.com |
| `andela` | Andela | `gigster` | Gigster |
| `turing` | Turing | `topcoder` | Topcoder |
| `gun-io` | Gun.io | `scalable-path` | Scalable Path |
| — | — | `deazy` | Deazy (agency marketplace, matched via post body) |

**How a job is matched** (conservative, to avoid filtering real employers):

1. **Company name** — normalized exact match, ignoring punctuation and legal suffixes (`Proxify AB` → `proxify`, `Lemon.io` → `lemon io`).
2. **Owned host** — e.g. `toptal.com`, `lemon.io`, `a.team` (subdomains included).
3. **Aggregator URL slug** — e.g. `weworkremotely.com/remote-jobs/toptal-…` or `remoteok.com/…-lemon-io-1137475`.
4. **Body marker** — unambiguous phrases used only by platform-managed postings (e.g. `deazy`), so agency subcontracts reposted under a different company name (e.g. `Somnio Software` via Deazy) are still caught.

**Extending the list:** append an entry to `AGENCY_PLATFORMS` in `scripts/agency_blocklist.ts` with `companyNames` / `hosts` / `urlSlugs` / `contentMarkers`.

**Overrides:**

```bash
# Re-include all agency platforms (e.g. to audit the raw feed)
node skills/jd-matcher-skill/scripts/search.ts --months 2 --include-agencies --limit 30
node skills/jd-matcher-skill/scripts/crawl.ts --include-agencies --limit 40

# Exempt one platform (keys from the table above)
node skills/jd-matcher-skill/scripts/search.ts --months 2 --allow-agency proxify --limit 30
node skills/jd-matcher-skill/scripts/crawl.ts --allow-agency turing,upwork --limit 40

# Skip the (slower) post-body scan, matching on company/host/slug only
node skills/jd-matcher-skill/scripts/search.ts --months 2 --no-agency-content-scan
```

---

## Visual Dashboard & Frosted Workbench Design System

Unless the user explicitly specifies another design framework or style, **all generated visual dashboard pages MUST default to the Frosted Workbench aesthetic** (dark mode included):

- **Frosted Glass Surfaces**: Warm neutral canvas (`#EFEDE9`) washed with large lime/apricot/indigo gradient blobs, plus translucent panels (`rgba(255,255,255,0.58)`, `backdrop-filter: blur(20px)`) with 1px white hairlines and very soft, wide shadows.
- **Neo-Grotesque Typography**: A single sans stack (`Inter` → Helvetica → system UI) with tight tracking on the display title, tabular numerals for all metrics, and 10–11px uppercase tracked labels. No serif.
- **Signal Colors**: Chartreuse lime (`#F2EA2E`), apricot (`#FE9251`) and ink black (`#0D0D0D`) drive one bento accent card each; blue (`#1E82C2`) is reserved for secondary score tiers.
- **Bento Layout**: 12-column grid — lime stat card, apricot stat card, ink "top pick" spotlight, a wide activity bar chart and a signal ring; generous 22–28px radii and pill (999px) controls.
- **Icon Rail Navigation**: A sticky frosted rail with 4 icon tabs (Matches / Crawled / History / Vetoed); on ≤1000px it collapses to a horizontal glass bar with labels.
- **Interactive Capabilities**: Dynamic client-side search, score/source filters, reset pill, expandable long-form analysis (`Read more`), tab switching between Matched Jobs, Crawled Knowledge Base, Evaluation History and the Veto Audit log.
- **Cumulative History**: The Matched tab groups every recommended job under its **evaluation date section** (newest run first), so all history stays visible; each card shows its evaluation date and source report, and jobs re-evaluated in multiple runs carry a `↻ N× evaluated` badge. A dedicated **Evaluation History** tab lists every aggregated report with its matched/vetoed counts.

---

## Script Options Reference

### `crawl.ts`
- `--limit <number>`: Maximum number of jobs to fetch per source (default: 40).
- `--source <all|remoteok|weworkremotely|remotive|jobspresso|workingnomads|nodesk>`: Data source to crawl (default: all).
- `--out <dir>`: Target knowledge base output directory (default: `data/jds`).
- `--include-agencies` / `--no-agency-filter`: Disable talent-agency / marketplace filtering (default: filtering ON).
- `--allow-agency <key1,key2>`: Exempt specific agency platforms from filtering (e.g. `proxify,toptal`).

### `search.ts`
- `--months <number>`: Number of recent months to inspect (default: 2).
- `--tags <tag1,tag2>`: Comma-separated Frontmatter tags to match.
- `--keywords <k1,k2>`: Comma-separated keywords to search in title and content.
- `--location <text>`: Location substring filter (e.g., `worldwide`).
- `--limit <number>`: Maximum number of results to return (default: 20).
- `--exclude-matched` / `--unmatched-only`: Strictly exclude already evaluated jobs (matched or rejected) in past reports.
- `--prioritize-unmatched`: Sort fresh unmatched jobs ahead of evaluated ones (default: enabled).
- `--include-matched`: Do not prioritize unmatched jobs, sort purely by post date.
- `--matches-dir <dir>`: Custom path to match reports directory (default: `data/matches`).
- `--format <markdown|json>`: Output format (default: `markdown`).
- `--include-agencies` / `--no-agency-filter`: Disable talent-agency / marketplace filtering (default: filtering ON).
- `--allow-agency <key1,key2>`: Exempt specific agency platforms from filtering (e.g. `proxify,toptal`).
- `--no-agency-content-scan`: Match agencies on company / host / URL slug only (skip the body-marker scan).

### `dashboard.ts`
- `--open`: Automatically opens `data/matches/dashboard.html` in the user's default browser upon generation.
- Recursively scans `data/jds/**/*.md` and `data/matches/**/*.md` (including `archive/`) to build the complete data bundle (`data.json` and `data.js`).
- Deduplicates matches across all reports by normalized URL (newest evaluation wins, full evaluation history preserved), deduplicates rejections by company + title, and emits a per-report timeline (`reports[]`) used by the Evaluation History tab.
- Report evaluation dates are resolved from the filename `YYYY-MM-DD` first, then the report body, then file mtime.
