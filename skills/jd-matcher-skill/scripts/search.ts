import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchOptions, SearchResultItem, SearchStats } from "./types.ts";
import { parseFrontmatter, buildEvaluatedJobIndex, checkJobEvaluated } from "./utils.ts";
import { detectAgencyPlatform } from "./agency_blocklist.ts";

const DEFAULT_JDS_DIR = path.resolve(process.cwd(), "data/jds");
const DEFAULT_MATCHES_DIR = path.resolve(process.cwd(), "data/matches");

/**
 * Get list of Year/Month directories for the last N months
 */
export function getTargetMonthDirs(baseDir: string, monthsCount = 2): string[] {
  const dirs: string[] = [];
  const now = new Date();

  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = String(d.getUTCFullYear());
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const targetDir = path.join(baseDir, year, month);
    if (fs.existsSync(targetDir)) {
      dirs.push(targetDir);
    }
  }

  return dirs;
}

/**
 * Term matching for `--tags` and `--keywords`.
 *
 * Both flags used to be implemented as `haystack.includes(term)` over the *entire*
 * markdown body. That made them nearly useless: `go` matched every posting containing
 * "Google", "good" or "goals", so any broad tag list (`--tags go,golang,kubernetes,…`)
 * let every JD through. Matching is now word-bounded and scoped per flag:
 *
 * | Flag       | Scope                                                          |
 * |------------|----------------------------------------------------------------|
 * | `--tags`   | Frontmatter `tags[]` (exact) + title (word-bounded). No body.   |
 * | `--keywords` | Title, company, tags, locations, and body (word-bounded).     |
 *
 * The body is excluded from tag matching because tags are a controlled vocabulary;
 * the title fallback exists because ~70% of ingested JDs ship with `tags: []`.
 */

const TERM_REGEX_CACHE = new Map<string, RegExp>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a word-bounded pattern that tolerates separator differences, so
 * "full stack" matches "full-stack", "fullstack" and "Full Stack";
 * "backend" matches "back end"/"back-end"; "c++" and ".net" keep their punctuation.
 *
 * Very short single tokens ("go", "ai", "c") additionally refuse to match inside a
 * hyphenated compound, so a Go-language query does not hit "VP, Go-To-Market".
 */
export function buildTermPattern(term: string): string {
  const pieces = term
    .trim()
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map(escapeRegExp);

  if (pieces.length === 0) return "";
  const core = pieces.join("[\\s\\-_/]*");

  const isShortSingleToken = pieces.length === 1 && termWeight(term) <= 2;
  const boundary = isShortSingleToken ? "[a-z0-9\\-]" : "[a-z0-9]";

  const startsAlnum = /^[a-z0-9]/.test(term.trim());
  const endsAlnum = /[a-z0-9]$/.test(term.trim());
  return `${startsAlnum ? `(?<!${boundary})` : ""}${core}${
    endsAlnum ? `(?!${boundary})` : ""
  }`;
}

export function buildTermRegex(term: string): RegExp {
  const cached = TERM_REGEX_CACHE.get(term);
  if (cached) return cached;
  const regex = new RegExp(buildTermPattern(term), "i");
  TERM_REGEX_CACHE.set(term, regex);
  return regex;
}

/** Normalize a frontmatter tag for exact comparison: lowercase, punctuation stripped. */
export function normalizeTagKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, "");
}

/** Count of alphanumeric characters — used to decide whether a term is too short for prose. */
function termWeight(term: string): number {
  return term.replace(/[^a-z0-9]/gi, "").length;
}

/**
 * A tag matches when it equals a frontmatter tag (punctuation-insensitive) or appears
 * word-bounded in the title. Body text is never consulted — see the flag table above.
 */
export function matchesAnyTag(
  queryTags: string[],
  jobTags: string[],
  jobTitle: string
): boolean {
  // Separator-only terms ("--") would compile to an empty regex that matches everything.
  const usableTags = queryTags.filter((t) => buildTermPattern(t) !== "");
  if (usableTags.length === 0) return true;

  const normalizedJobTags = jobTags.map((t) => normalizeTagKey(String(t)));

  return usableTags.some((query) => {
    const queryKey = normalizeTagKey(query);
    if (queryKey && normalizedJobTags.includes(queryKey)) return true;
    return buildTermRegex(query).test(jobTitle);
  });
}

export interface KeywordFields {
  title: string;
  company: string;
  tags: string[];
  locations: string[];
  body: string;
}

/**
 * A keyword matches when it appears word-bounded in any strong field (title, company,
 * tags, locations) or — for terms of 3+ alphanumerics — in the body.
 * Very short terms ("go", "ai", "c") are kept out of prose because they carry no signal
 * there ("go to market", "maintain", "c-level").
 */
export function matchesAnyKeyword(queryKeywords: string[], fields: KeywordFields): boolean {
  const usableKeywords = queryKeywords.filter((k) => buildTermPattern(k) !== "");
  if (usableKeywords.length === 0) return true;

  const strongFields = [
    fields.title,
    fields.company,
    fields.tags.join(" "),
    fields.locations.join(" "),
  ].join(" \n ");

  return usableKeywords.some((keyword) => {
    const regex = buildTermRegex(keyword);
    if (regex.test(strongFields)) return true;
    if (termWeight(keyword) < 3) return false;
    return regex.test(fields.body);
  });
}

/**
 * Search and filter JDs in the Markdown Knowledge Base.
 * By default, fresh/unmatched jobs are prioritized ahead of already evaluated jobs.
 * When excludeMatched/unmatchedOnly is true, already evaluated jobs are ignored.
 */
export function searchJDs(options: SearchOptions = {}): SearchResultItem[] {
  const {
    months = 2,
    tags = [],
    keywords = [],
    location = "",
    limit = 25,
    jdsDir = DEFAULT_JDS_DIR,
    matchesDir = DEFAULT_MATCHES_DIR,
    excludeMatched = false,
    unmatchedOnly = false,
    prioritizeUnmatched = true,
    includeMatched = false,
    filterAgencies = true,
    allowedAgencies = [],
    inspectAgencyContent = true,
    stats,
  } = options;

  if (!fs.existsSync(jdsDir)) {
    return [];
  }

  // Build evaluated jobs index from match reports (matches and rejections)
  const evalIndex = buildEvaluatedJobIndex(matchesDir);

  // 1. Locate directories within the last N months
  const targetDirs = getTargetMonthDirs(jdsDir, months);
  const matchedFiles: string[] = [];

  for (const dir of targetDirs) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        matchedFiles.push(path.join(dir, f));
      }
    }
  }

  const normalizedTags = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const normalizedKeywords = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const locLower = location.trim().toLowerCase();

  const results: SearchResultItem[] = [];

  for (const filePath of matchedFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const { metadata, body } = parseFrontmatter(content);

    if (!metadata.id || !metadata.title) continue;

    const relPath = path.relative(process.cwd(), filePath);

    // Drop talent-agency / freelance-marketplace postings (Proxify, Lemon.io,
    // Toptal, …) so they are never evaluated or recommended again.
    if (filterAgencies) {
      const agency = detectAgencyPlatform(
        {
          company: metadata.company,
          title: metadata.title,
          url: metadata.url,
          content,
        },
        { allow: allowedAgencies, inspectContent: inspectAgencyContent }
      );
      if (agency) {
        if (stats) {
          stats.agencyFiltered += 1;
          stats.agencyMatches.push({
            platform: agency.platform.name,
            title: metadata.title || "",
            company: metadata.company || "",
            url: metadata.url || "",
            reason: agency.reason,
          });
        }
        continue;
      }
    }

    // Check evaluation status against past match reports
    const evalCheck = checkJobEvaluated(
      {
        id: metadata.id,
        url: metadata.url,
        title: metadata.title,
        company: metadata.company,
        filePath,
        relPath,
      },
      evalIndex
    );

    // If filtering to exclude already evaluated jobs, skip immediately
    if ((excludeMatched || unmatchedOnly) && evalCheck.evaluated) {
      continue;
    }

    const jobTags = (metadata.tags || []).map((t) => String(t));
    const jobTitle = String(metadata.title || "");
    const jobCompany = String(metadata.company || "");
    const jobLocations = (metadata.locations || []).map((l) => String(l));

    // Tag filter (if specified, job must match at least one tag).
    // Scope: frontmatter tags + title only — never the body (see flag table above).
    if (!matchesAnyTag(normalizedTags, jobTags, jobTitle)) continue;

    // Keyword filter (if specified, job must match at least one keyword).
    if (
      !matchesAnyKeyword(normalizedKeywords, {
        title: jobTitle,
        company: jobCompany,
        tags: jobTags,
        locations: jobLocations,
        body,
      })
    ) {
      continue;
    }

    // Location filter (if specified)
    if (locLower) {
      const matchLoc = jobLocations.some((l) => {
        const value = l.toLowerCase();
        return value.includes(locLower) || value.includes("worldwide") || value.includes("anywhere");
      });
      if (!matchLoc) continue;
    }

    results.push({
      id: metadata.id,
      title: metadata.title,
      company: metadata.company || "Unknown",
      source: metadata.source || "unknown",
      url: metadata.url || "",
      posted_at: metadata.posted_at || "",
      locations: metadata.locations || [],
      salary: metadata.salary || "Not specified",
      tags: metadata.tags || [],
      filePath,
      relPath,
      isEvaluated: evalCheck.evaluated,
      evaluationStatus: evalCheck.status || "unmatched",
      evaluatedInReport: evalCheck.reportFile,
    });
  }

  // Sort: prioritize fresh unmatched jobs ahead of evaluated ones by default
  results.sort((a, b) => {
    if (prioritizeUnmatched && !includeMatched) {
      const aVal = a.isEvaluated ? 1 : 0;
      const bVal = b.isEvaluated ? 1 : 0;
      if (aVal !== bVal) {
        return aVal - bVal; // 0 (unmatched) comes first
      }
    }
    const tA = new Date(a.posted_at).getTime() || 0;
    const tB = new Date(b.posted_at).getTime() || 0;
    return tB - tA;
  });

  return results.slice(0, limit);
}

/**
 * Format search results as a clean Markdown report
 */
export function formatResultsMarkdown(
  results: SearchResultItem[],
  stats?: SearchStats
): string {
  if (results.length === 0) {
    const filteredNote =
      stats && stats.agencyFiltered > 0
        ? `\n\n> 🚫 Filtered ${stats.agencyFiltered} talent-agency / freelance-marketplace job(s).`
        : "";
    return "No matching remote jobs found in the specified time window." + filteredNote;
  }

  const newCount = results.filter((r) => !r.isEvaluated).length;
  const evalCount = results.filter((r) => r.isEvaluated).length;

  const lines = [
    `### Knowledge Base Search Results (${results.length} Candidate JDs: ${newCount} New/Unmatched, ${evalCount} Evaluated)${
      stats && stats.agencyFiltered > 0
        ? ` — 🚫 ${stats.agencyFiltered} agency-marketplace job(s) filtered`
        : ""
    }\n`,
    "| ID | Title | Company | Status | Source | Posted | Locations | Salary | Path |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const item of results) {
    const dateStr = item.posted_at ? item.posted_at.split("T")[0] : "N/A";
    const locStr = item.locations.slice(0, 2).join(", ") || "Worldwide";
    const salStr = item.salary.replace(/💰\s*/, "") || "Not specified";
    const statusStr = !item.isEvaluated
      ? "🟢 New"
      : item.evaluationStatus === "rejected"
        ? "❌ Rejected"
        : "⚪ Matched";

    lines.push(
      `| \`${item.id}\` | [${item.title}](${item.url}) | ${item.company} | ${statusStr} | ${item.source} | ${dateStr} | ${locStr} | ${salStr} | \`${item.relPath}\` |`
    );
  }

  return lines.join("\n") + "\n";
}

// CLI entry point
function run() {
  const args = process.argv.slice(2);
  const stats: SearchStats = { agencyFiltered: 0, agencyMatches: [] };
  const options: SearchOptions = {
    months: 2,
    tags: [],
    keywords: [],
    location: "",
    limit: 20,
    prioritizeUnmatched: true,
    filterAgencies: true,
    allowedAgencies: [],
    stats,
  };
  let format: "markdown" | "json" = "markdown";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--months" && args[i + 1]) {
      options.months = parseInt(args[i + 1], 10) || 2;
      i++;
    } else if (args[i] === "--tags" && args[i + 1]) {
      options.tags = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (args[i] === "--keywords" && args[i + 1]) {
      options.keywords = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (args[i] === "--location" && args[i + 1]) {
      options.location = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10) || 20;
      i++;
    } else if (args[i] === "--format" && args[i + 1]) {
      format = args[i + 1] as "markdown" | "json";
      i++;
    } else if (args[i] === "--exclude-matched" || args[i] === "--unmatched-only") {
      options.excludeMatched = true;
    } else if (args[i] === "--prioritize-unmatched") {
      options.prioritizeUnmatched = true;
      options.includeMatched = false;
    } else if (args[i] === "--include-matched") {
      options.includeMatched = true;
      options.prioritizeUnmatched = false;
    } else if (args[i] === "--matches-dir" && args[i + 1]) {
      options.matchesDir = args[i + 1];
      i++;
    } else if (args[i] === "--include-agencies" || args[i] === "--no-agency-filter") {
      options.filterAgencies = false;
    } else if (args[i] === "--allow-agency" && args[i + 1]) {
      options.allowedAgencies = args[i + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    } else if (args[i] === "--no-agency-content-scan") {
      options.inspectAgencyContent = false;
    }
  }

  const results = searchJDs(options);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatResultsMarkdown(results, stats));
    if (options.filterAgencies !== false && stats.agencyMatches.length > 0) {
      console.log("\n#### 🚫 Filtered Agency / Marketplace Platforms\n");
      for (const m of stats.agencyMatches) {
        console.log(`- **${m.platform}** — ${m.title} (${m.company}) → ${m.reason}`);
      }
    }
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("search.ts"));

if (isMain) {
  run();
}
