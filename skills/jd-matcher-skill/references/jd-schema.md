# JD Knowledge Base Document Schema (Glean-Inspired Markdown Specification)

This specification defines a structured, self-contained, and highly indexable document model for Job Descriptions (JDs), drawing inspiration from enterprise search systems like Glean.

---

## 1. Storage Hierarchy and Naming Conventions

### 1.1 Date Partitioning
To ensure high-performance temporal filtering, documents are partitioned by the date they were posted:
```
data/jds/<YYYY>/<MM>/<filename>.md
```
- `<YYYY>`: 4-digit year, e.g., `2026`
- `<MM>`: 2-digit zero-padded month, e.g., `09`, `10`
- If the posting date cannot be determined from the source, the current crawl date is used as a fallback.

### 1.2 File Naming Convention
```
<source>-<source_id>-<slug>.md
```
- `<source>`: Data source identifier, e.g., `rok` (RemoteOK), `wwr` (WeWorkRemotely).
- `<source_id>`: Unique platform identifier or hash.
- `<slug>`: Normalized alphanumeric slug of the company and job title (lowercase, hyphens, max 40 chars).
- **Examples**:
  - `rok-104928-senior-fullstack-supabase.md`
  - `wwr-839201-backend-developer-automattic.md`

---

## 2. YAML Frontmatter Metadata Schema

Every JD document must start with a standard YAML Frontmatter block containing the following attributes:

| Field | Type | Description | Example |
|---|---|---|---|
| `id` | string | Unique document ID (`<source>-<source_id>`) | `"rok-104928"` |
| `title` | string | Job role title | `"Senior Full Stack Engineer"` |
| `company` | string | Company or organization name | `"Supabase"` |
| `source` | string | Data source platform | `"remoteok"` or `"weworkremotely"` |
| `url` | string | Canonical URL for job details/application | `"https://remoteok.com/..."` |
| `posted_at` | string | Original published timestamp (ISO 8601 or RFC 2822) | `"2026-10-05T12:00:00Z"` |
| `crawled_at` | string | Timestamp when ingested into KB (ISO 8601) | `"2026-10-10T01:30:00Z"` |
| `locations` | array | Allowed locations or timezone requirements | `["Worldwide", "Remote"]` |
| `salary` | string | Listed compensation range (empty string if not specified) | `"$140,000 - $180,000"` |
| `tags` | array | Normalized lowercase tags (skills, categories, seniority) | `["typescript", "react", "node"]` |
| `status` | string | Availability status (`active` or `expired`) | `"active"` |

---

## 3. Markdown Content Body Standard

The body content strips redundant HTML formatting, ads, navigation bars, and cookie notices, standardizing into clean Markdown with clear section headings:

```markdown
---
id: "rok-104928"
title: "Senior Full Stack Engineer"
company: "Supabase"
source: "remoteok"
url: "https://remoteok.com/remote-jobs/104928"
posted_at: "2026-10-05T12:00:00Z"
crawled_at: "2026-10-10T01:30:00Z"
locations: ["Worldwide"]
salary: "$140,000 - $180,000"
tags: ["typescript", "react", "node", "postgres"]
status: "active"
---

# Senior Full Stack Engineer - Supabase

## Role Overview
Brief description of the role, team mission, and high-level responsibilities.

## Responsibilities
- Architect and build features across our web and backend stack.
- Write maintainable, well-tested code and collaborate with cross-functional teams.

## Requirements
- 5+ years of production experience with React, TypeScript, and Node.js.
- Strong knowledge of relational databases and system design.
- Excellent written English and async collaboration skills.

## Compensation & Benefits
- $140,000 - $180,000 USD annual salary + equity options.
- 100% remote flexibility with home office stipend.
```

---

## 4. Deduplication & Idempotency Strategy

1. **Deduplication Key**: Evaluated by canonical `id` (`<source>-<source_id>`) and unique file path.
2. **Idempotent Writes**: When ingesting, if a file with the target path already exists, the write operation is skipped to eliminate unnecessary disk I/O and preserve the original ingestion timestamp.
