import * as fs from "node:fs";
import * as path from "node:path";
import type { SearchOptions, SearchResultItem } from "./types.ts";
import { parseFrontmatter } from "./utils.ts";

const DEFAULT_JDS_DIR = path.resolve(process.cwd(), "data/jds");

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
 * Search and filter JDs in the Markdown Knowledge Base
 */
export function searchJDs(options: SearchOptions = {}): SearchResultItem[] {
  const {
    months = 2,
    tags = [],
    keywords = [],
    location = "",
    limit = 25,
    jdsDir = DEFAULT_JDS_DIR,
  } = options;

  if (!fs.existsSync(jdsDir)) {
    return [];
  }

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

    const jobTags = (metadata.tags || []).map((t) => String(t).toLowerCase());
    const jobTitle = String(metadata.title).toLowerCase();
    const jobCompany = String(metadata.company || "").toLowerCase();
    const jobLocations = (metadata.locations || []).map((l) => String(l).toLowerCase());
    const fullText = (content).toLowerCase();

    // Tag filter (if specified, job must match at least one tag)
    if (normalizedTags.length > 0) {
      const hasTag = normalizedTags.some(
        (t) => jobTags.includes(t) || jobTitle.includes(t) || fullText.includes(t)
      );
      if (!hasTag) continue;
    }

    // Keyword filter (if specified, job must match at least one keyword)
    if (normalizedKeywords.length > 0) {
      const hasKeyword = normalizedKeywords.some(
        (k) => jobTitle.includes(k) || jobCompany.includes(k) || fullText.includes(k)
      );
      if (!hasKeyword) continue;
    }

    // Location filter (if specified)
    if (locLower) {
      const matchLoc = jobLocations.some(
        (l) => l.includes(locLower) || l.includes("worldwide") || l.includes("anywhere")
      );
      if (!matchLoc) continue;
    }

    const relPath = path.relative(process.cwd(), filePath);

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
    });
  }

  // Sort by posted_at descending (freshest first)
  results.sort((a, b) => {
    const tA = new Date(a.posted_at).getTime() || 0;
    const tB = new Date(b.posted_at).getTime() || 0;
    return tB - tA;
  });

  return results.slice(0, limit);
}

/**
 * Format search results as a clean Markdown report
 */
export function formatResultsMarkdown(results: SearchResultItem[]): string {
  if (results.length === 0) {
    return "No matching remote jobs found in the specified time window.";
  }

  const lines = [
    `### Knowledge Base Search Results (${results.length} Candidate JDs Found)\n`,
    "| ID | Title | Company | Source | Posted | Locations | Salary | Path |",
    "|---|---|---|---|---|---|---|---|",
  ];

  for (const item of results) {
    const dateStr = item.posted_at ? item.posted_at.split("T")[0] : "N/A";
    const locStr = item.locations.slice(0, 2).join(", ") || "Worldwide";
    const salStr = item.salary.replace(/💰\s*/, "") || "Not specified";
    lines.push(
      `| \`${item.id}\` | [${item.title}](${item.url}) | ${item.company} | ${item.source} | ${dateStr} | ${locStr} | ${salStr} | \`${item.relPath}\` |`
    );
  }

  return lines.join("\n") + "\n";
}

// CLI entry point
function run() {
  const args = process.argv.slice(2);
  const options: SearchOptions = {
    months: 2,
    tags: [],
    keywords: [],
    location: "",
    limit: 20,
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
    }
  }

  const results = searchJDs(options);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatResultsMarkdown(results));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
