---
name: jd-matcher-skill
description: >-
  Crawl latest remote jobs into a local Glean-inspired Markdown knowledge base,
  filter recent 2-month opportunities via file system search (find/grep),
  and evaluate candidate resume and expectations to provide tailored job recommendations.
  Presents matched results in an interactive Kami-styled HTML dashboard.
  Use when the user wants to fetch latest remote jobs, match remote jobs with their resume,
  or search and recommend job openings locally.
---

# JD Matcher Skill

This skill provides a local-first, database-free, and serverless-free workflow for discovering and matching remote jobs.
Job postings are archived as structured Markdown knowledge base files in the local filesystem, enabling rapid two-stage retrieval via native date-partitioned directories, `find`, and `grep`, followed by deep AI semantic evaluation against candidate profile constraints.

Results are presented in an elegant, interactive HTML visual dashboard styled according to the **Kami (`紙`)** design system.

---

## Runtime Requirements

- **Node.js**: >= 22.6.0 (supports direct TypeScript execution natively)
- **or Bun**: >= 1.0 (supports TypeScript out of the box)

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
    ├── dashboard.html                # Kami-styled interactive visual dashboard (git-ignored)
    ├── data.json / data.js           # Dynamic data bundle for dashboard (git-ignored)
    └── YYYY-MM-DD-report.md          # AI-generated recommendation report (git-ignored)
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

Run the crawler script to fetch the latest remote opportunities from RemoteOK and WeWorkRemotely, automatically saving them as date-partitioned Markdown files under `data/jds/<YYYY>/<MM>/`:

```bash
# Crawl latest 30 jobs across all sources (automatic deduplication)
node skills/jd-matcher-skill/scripts/crawl.ts --limit 30

# Or target a specific source
node skills/jd-matcher-skill/scripts/crawl.ts --source remoteok --limit 20
node skills/jd-matcher-skill/scripts/crawl.ts --source weworkremotely --limit 20
```

### Step 3: Two-Stage Fast Retrieval & Filtering (Retrieve & Filter)

Filter for fresh opportunities posted within the **last 2 months** matching the candidate's core tech stack and role titles:

```bash
# Filter by tech tags within the last 2 months
node skills/jd-matcher-skill/scripts/search.ts --months 2 --tags typescript,react,fullstack --limit 15

# Or filter by keywords and role titles
node skills/jd-matcher-skill/scripts/search.ts --months 2 --keywords backend,golang,api --limit 15
```

The script outputs a markdown summary table of matching candidate JDs along with their relative file paths.

### Step 4: AI Agent Deep Evaluation & Scoring (Evaluate)

Follow the evaluation rubric: [evaluation-rubric.md](./references/evaluation-rubric.md).

1. **Hard Constraints Gate (Strict Veto)**:
   - Check if each JD violates any requirement in `data/profile/expectations.md` (e.g., US-only citizenship, non-remote requirement, insufficient salary floor). Immediately reject non-compliant jobs and record the rejection reason.
2. **Deep Fit Scoring (0-10 Scale)**:
   - For JDs passing the hard gate, read the full Markdown file using the `view_file` tool and evaluate fit:
     - **9.0 - 10.0**: Outstanding match (core stack, seniority, and domain all align strongly). Top recommendation.
     - **7.0 - 8.9**: Good fit (majority of core requirements met, minor gaps). Recommended for application.
     - **6.0 - 6.9**: Acceptable (meets minimum qualifications, notable gaps exist). Borderline.
     - **< 6.0**: Below threshold. Exclude from recommendation.

### Step 5: Generate Report & Launch Visual Dashboard (Report & Dashboard)

1. **Archive Match Report**:
   Compile all recommendations scoring >= 6.0 into a structured report saved to `data/matches/YYYY-MM-DD-report.md`.
2. **Generate Kami-Styled Visual Dashboard**:
   Run the dashboard builder script:
   ```bash
   node skills/jd-matcher-skill/scripts/dashboard.ts --open
   ```
   This generates `data/matches/dashboard.html` (along with `data.json` and `data.js`) adhering to the **Kami (`紙`)** design system and opens it in the user's default browser (`xdg-open` on Linux, `open` on macOS).
3. **Present Chat Summary**:
   Provide a concise executive summary in the active chat session:
   - **Role Title & Company**
   - **Original Application URL**
   - **Match Score**
   - **Why Match**: Key technical and experiential alignments.
   - **Skill Gaps & Application Tips**: Strategic tailoring advice.

---

## Visual Dashboard & Kami (`紙`) Design System

Unless the user explicitly specifies another design framework or style, **all generated visual dashboard pages MUST default to the Kami (`紙`) aesthetic**:

- **Paper Aesthetic**: Warm off-white background tones (`#FAF8F5`, `#F7F5F0`, `#EFECE6`), evoking traditional premium paper.
- **Editorial Typography**: Elegant serif headings (`Noto Serif`, `Source Han Serif`, `Georgia`) combined with crisp system sans body text (`Inter`, system UI) and monospace font for technical tags.
- **Ink-Blue & Deep Slate Accents**: Ink-blue accents (`#1E3A8A`, `#1B365D`) for primary elements and brand accents, balanced with charcoal slate text (`#1C1917`, `#44403C`).
- **Craft Layout**: Generous whitespace, subtle borders (`#E2DFD7`), soft card elevations, and elegant metric pill tags.
- **Interactive Capabilities**: Dynamic client-side search, multi-facet filtering (source, tags, match tiers), detail expansion drawer, and active tab switching between Matched Jobs, Hard Gate Rejections, and Crawled Knowledge Base.

---

## Script Options Reference

### `crawl.ts`
- `--limit <number>`: Maximum number of jobs to fetch per source (default: 40).
- `--source <all|remoteok|weworkremotely>`: Data source to crawl (default: all).
- `--out <dir>`: Target knowledge base output directory (default: `data/jds`).

### `search.ts`
- `--months <number>`: Number of recent months to inspect (default: 2).
- `--tags <tag1,tag2>`: Comma-separated Frontmatter tags to match.
- `--keywords <k1,k2>`: Comma-separated keywords to search in title and content.
- `--location <text>`: Location substring filter (e.g., `worldwide`).
- `--limit <number>`: Maximum number of results to return (default: 20).
- `--format <markdown|json>`: Output format (default: `markdown`).

### `dashboard.ts`
- `--open`: Automatically opens `data/matches/dashboard.html` in the user's default browser upon generation.
- Dynamically scans `data/jds/**/*.md` and `data/matches/*.md` to build the complete data bundle (`data.json` and `data.js`).
