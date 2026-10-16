import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { parseFrontmatter, normalizeUrl, normalizeKey, normalizeCompanyKey } from "./utils.ts";

export interface CrawledJobSummary {
  id: string;
  title: string;
  company: string;
  source: string;
  url: string;
  postedAt: string;
  crawledAt: string;
  locations: string[];
  salary: string;
  tags: string[];
  status: string;
  relPath: string;
}

export interface EvaluationHistoryEntry {
  date: string;
  score: number;
  reportFile: string;
}

export interface MatchedJobRecord {
  id: string;
  title: string;
  company: string;
  source: string;
  url: string;
  postedAt: string;
  /** Date of the newest evaluation that produced this record */
  evaluatedAt: string;
  /** Date this job was first recommended in any report */
  firstSeenAt: string;
  /** How many reports recommended this job (incl. repeats) */
  timesEvaluated: number;
  /** Per-report evaluation history, newest first */
  history: EvaluationHistoryEntry[];
  /** Report file that provided the current (newest) record */
  reportFile: string;
  locations: string[];
  salary: string;
  matchScore: number;
  whyMatch: string;
  tips: string;
  localPath?: string;
}

export interface RejectionRecord {
  title: string;
  company: string;
  reason: string;
  evaluatedAt: string;
  firstSeenAt: string;
  timesSeen: number;
  reportFile: string;
}

export interface ReportSummary {
  date: string;
  file: string;
  matched: number;
  rejected: number;
}

export interface DashboardDataBundle {
  updatedAt: string;
  stats: {
    totalCrawled: number;
    totalMatched: number;
    topMatches: number;
    avgScore: string;
    totalVetoed: number;
    totalReports: number;
    /** "firstEvaluation → latestEvaluation" across all history */
    historySpan: string;
  };
  reports: ReportSummary[];
  matches: MatchedJobRecord[];
  rejections: RejectionRecord[];
  crawledJds: CrawledJobSummary[];
}

const DEFAULT_JDS_DIR = path.resolve(process.cwd(), "data/jds");
const DEFAULT_MATCHES_DIR = path.resolve(process.cwd(), "data/matches");
const DASHBOARD_OUTPUT_PATH = path.join(DEFAULT_MATCHES_DIR, "dashboard.html");
const DATA_JSON_PATH = path.join(DEFAULT_MATCHES_DIR, "data.json");
const DATA_JS_PATH = path.join(DEFAULT_MATCHES_DIR, "data.js");

/**
 * Dynamically scan all crawled Markdown files in data/jds/
 */
export function getAllCrawledJds(jdsDir = DEFAULT_JDS_DIR): CrawledJobSummary[] {
  const list: CrawledJobSummary[] = [];
  if (!fs.existsSync(jdsDir)) return list;

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(full, "utf-8");
          const { metadata } = parseFrontmatter(content);
          if (metadata.id && metadata.title) {
            list.push({
              id: metadata.id,
              title: metadata.title,
              company: metadata.company || "Unknown",
              source: metadata.source || "unknown",
              url: metadata.url || "",
              postedAt: metadata.posted_at ? metadata.posted_at.split("T")[0] : "Recent",
              crawledAt: metadata.crawled_at || "",
              locations: metadata.locations || ["Worldwide"],
              salary: metadata.salary || "Not specified",
              tags: (metadata.tags || []).map((t) => String(t).toLowerCase()),
              status: metadata.status || "active",
              relPath: path.relative(process.cwd(), full),
            });
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  walk(jdsDir);
  return list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
}

interface RawMatchEntry {
  title: string;
  company: string;
  source: string;
  url: string;
  postedAt: string;
  locations: string[];
  salary: string;
  matchScore: number;
  whyMatch: string;
  tips: string;
  localPath?: string;
  evaluatedAt: string;
  reportFile: string;
}

interface RawRejectionEntry {
  title: string;
  company: string;
  reason: string;
  url?: string;
  evaluatedAt: string;
  reportFile: string;
}

/**
 * Recursively collect every markdown report under a directory
 * (including archive/ subfolders), skipping example templates.
 */
export function collectReportFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dirPath)) return results;

  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        !entry.name.endsWith(".example.md")
      ) {
        results.push(full);
      }
    }
  };

  walk(dirPath);
  return results.sort();
}

/** Deterministic short id derived from URL (or company+title fallback) */
function stableJobId(url: string, company: string, title: string): string {
  const basis =
    normalizeUrl(url) || `${normalizeCompanyKey(company)}:::${normalizeKey(title)}` || title;
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) >>> 0;
  }
  return `job-${hash.toString(36)}`;
}

/** Resolve a report's evaluation date: filename first, then content, then mtime */
function resolveEvaluatedAt(content: string, reportRelPath: string, fullPath: string): string {
  const fromName = path.basename(reportRelPath).match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];

  const fromContent = content.match(/Evaluation Date[^\d\n]{0,24}(\d{4}-\d{2}-\d{2})/i);
  if (fromContent) return fromContent[1];

  try {
    return fs.statSync(fullPath).mtime.toISOString().split("T")[0];
  } catch {
    return "Unknown";
  }
}

/** Compare evaluations: positive when `a` is newer (date desc, then filename desc) */
function compareEvaluation(aDate: string, aFile: string, bDate: string, bFile: string): number {
  if (aDate !== bDate) return aDate > bDate ? 1 : -1;
  if (aFile === bFile) return 0;
  return aFile > bFile ? 1 : -1;
}

/** Format a Date as a local (not UTC) YYYY-MM-DD string */
export function formatLocalDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse all markdown reports (recursively, including archive/) into a cumulative,
 * deduplicated history. When a job appears in multiple reports the newest
 * evaluation wins, while the full per-report history is preserved.
 */
export function parseAllReports(matchesDir: string = DEFAULT_MATCHES_DIR): {
  matches: MatchedJobRecord[];
  rejections: RejectionRecord[];
  reports: ReportSummary[];
} {
  const reports: ReportSummary[] = [];
  const rawMatches: RawMatchEntry[] = [];
  const rawRejections: RawRejectionEntry[] = [];

  for (const fullPath of collectReportFiles(matchesDir)) {
    const reportFile = path.relative(process.cwd(), fullPath);
    const content = fs.readFileSync(fullPath, "utf-8");
    const evaluatedAt = resolveEvaluatedAt(content, reportFile, fullPath);
    let matchedCount = 0;
    let rejectedCount = 0;

    // --- Matched job sections: "### 1. [Title](url)" ---
    const jobBlocks = content.split(/###\s+\d+\.\s+/).slice(1);
    for (const block of jobBlocks) {
      const titleMatch = block.match(/\[(.*?)\]\((.*?)\)/);
      if (!titleMatch) continue;

      const companyMatch = block.match(/Company[:\s*]+([^\n\r*]+)/i);
      const sourceMatch = block.match(/Source[:\s*]+([^\n\r*]+)/i);
      const postedMatch = block.match(/Posted[:\s*]+([^\n\r*]+)/i);
      const locMatch = block.match(/Locations?[:\s*]+([^\n\r*]+)/i);
      const salMatch = block.match(/Salary[:\s*]+([^\n\r*]+)/i);
      const scoreMatch = block.match(/Match Score[:\s*]+(?:\*\*)?([0-9.]+)/i);
      const localPathMatch = block.match(/Local File[:\s*]+`?([^\n\r`]+)`?/i);
      const whyMatchBlock = block.match(
        /Why Match[^:]*[:\s*]+([\s\S]*?)(?=(?:[^\n]*Application Tips|###|$))/i
      );
      const tipsBlock = block.match(/Application Tips[^:]*[:\s*]+([\s\S]*?)(?=(?:###|##|$))/i);

      rawMatches.push({
        title: titleMatch[1].trim(),
        url: titleMatch[2].trim(),
        company: companyMatch ? companyMatch[1].trim() : "Unknown",
        source: sourceMatch ? sourceMatch[1].trim() : "RemoteOK",
        postedAt: postedMatch ? postedMatch[1].trim() : "Recent",
        locations: locMatch ? locMatch[1].split(",").map((s) => s.trim()) : ["Worldwide"],
        salary: salMatch ? salMatch[1].trim() : "Not specified",
        matchScore: scoreMatch ? parseFloat(scoreMatch[1]) : 7.0,
        localPath: localPathMatch ? localPathMatch[1].trim() : undefined,
        whyMatch: whyMatchBlock
          ? whyMatchBlock[1]
              .split("\n")
              .map((l) => l.replace(/^[-*]\s*/, "").trim())
              .filter(Boolean)
              .join(" ")
          : "Strong alignment with candidate stack and experience.",
        tips: tipsBlock
          ? tipsBlock[1]
              .split("\n")
              .map((l) => l.replace(/^[-*]\s*/, "").trim())
              .filter(Boolean)
              .join(" ")
          : "Tailor resume highlights for this specific JD.",
        evaluatedAt,
        reportFile,
      });
      matchedCount++;
    }

    // --- Hard gate rejection table rows ---
    const lines = content.split("\n");
    let inRejectionSection = false;
    let inTableBody = false;
    for (const line of lines) {
      if (line.match(/Hard Gate Rejections|Rejected/i)) {
        inRejectionSection = true;
        inTableBody = false;
        continue;
      }
      if (inRejectionSection && line.startsWith("## ")) {
        inRejectionSection = false;
        inTableBody = false;
      }
      if (!inRejectionSection) continue;
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) {
        inTableBody = false;
        continue;
      }
      if (/^\|[\s:|-]+\|$/.test(trimmed) && trimmed.includes("-")) {
        inTableBody = true;
        continue;
      }
      if (!inTableBody) continue;

      const cols = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
      if (cols.length < 3) continue;
      const firstCol = cols[0].replace(/[*_]/g, "").trim();

      let title = firstCol;
      let url: string | undefined;
      const linkMatch = firstCol.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        title = linkMatch[1].trim();
        url = linkMatch[2].trim();
      }

      rawRejections.push({
        title,
        company: cols[1].replace(/[*_]/g, "").trim(),
        reason: (cols[2] || "Hard constraint veto").replace(/^[❌⛔\s]+/, "").trim(),
        url,
        evaluatedAt,
        reportFile,
      });
      rejectedCount++;
    }

    reports.push({ date: evaluatedAt, file: reportFile, matched: matchedCount, rejected: rejectedCount });
  }

  // Optional machine-readable ledgers (records.json / history.json)
  for (const jsonName of ["records.json", "history.json"]) {
    const jsonPath = path.join(matchesDir, jsonName);
    if (!fs.existsSync(jsonPath)) continue;
    try {
      const items = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const evaluatedAt =
          String(item.evaluatedAt || item.date || "").slice(0, 10) || formatLocalDate();
        if (item.status === "rejected") {
          rawRejections.push({
            title: item.title || "",
            company: item.company || "",
            reason: item.reason || "Hard constraint veto",
            url: item.url,
            evaluatedAt,
            reportFile: jsonName,
          });
        } else {
          rawMatches.push({
            title: item.title || "",
            company: item.company || "",
            source: item.source || "unknown",
            url: item.url || "",
            postedAt: item.postedAt || "Recent",
            locations: item.locations || ["Worldwide"],
            salary: item.salary || "Not specified",
            matchScore: Number(item.matchScore) || 7.0,
            whyMatch: item.whyMatch || "Strong alignment with candidate stack and experience.",
            tips: item.tips || "Tailor resume highlights for this specific JD.",
            localPath: item.localPath,
            evaluatedAt,
            reportFile: jsonName,
          });
        }
      }
    } catch {
      // ignore malformed json
    }
  }

  // ---- Merge matches: newest evaluation wins, full history preserved ----
  const matchByKey = new Map<string, MatchedJobRecord>();
  for (const raw of rawMatches) {
    const key =
      normalizeUrl(raw.url) || `${normalizeCompanyKey(raw.company)}:::${normalizeKey(raw.title)}`;
    const entry: EvaluationHistoryEntry = {
      date: raw.evaluatedAt,
      score: raw.matchScore,
      reportFile: raw.reportFile,
    };
    const existing = matchByKey.get(key);

    if (!existing) {
      matchByKey.set(key, {
        id: stableJobId(raw.url, raw.company, raw.title),
        title: raw.title,
        company: raw.company,
        source: raw.source,
        url: raw.url,
        postedAt: raw.postedAt,
        evaluatedAt: raw.evaluatedAt,
        firstSeenAt: raw.evaluatedAt,
        timesEvaluated: 1,
        history: [entry],
        reportFile: raw.reportFile,
        locations: raw.locations,
        salary: raw.salary,
        matchScore: raw.matchScore,
        whyMatch: raw.whyMatch,
        tips: raw.tips,
        localPath: raw.localPath,
      });
      continue;
    }

    if (!existing.history.some((h) => h.date === entry.date && h.reportFile === entry.reportFile)) {
      existing.history.push(entry);
    }
    existing.history.sort((a, b) =>
      compareEvaluation(b.date, b.reportFile, a.date, a.reportFile)
    );
    existing.timesEvaluated = existing.history.length;
    existing.firstSeenAt = existing.history.reduce(
      (min, h) => (h.date < min ? h.date : min),
      existing.history[0].date
    );

    if (compareEvaluation(raw.evaluatedAt, raw.reportFile, existing.evaluatedAt, existing.reportFile) > 0) {
      const history = existing.history;
      const id = existing.id;
      Object.assign(existing, {
        id,
        history,
        title: raw.title,
        company: raw.company,
        source: raw.source,
        url: raw.url,
        postedAt: raw.postedAt,
        evaluatedAt: raw.evaluatedAt,
        reportFile: raw.reportFile,
        locations: raw.locations,
        salary: raw.salary,
        matchScore: raw.matchScore,
        whyMatch: raw.whyMatch,
        tips: raw.tips,
        localPath: raw.localPath,
      });
    }
  }

  // ---- Merge rejections: newest reason wins, repeat count preserved ----
  const rejectionByKey = new Map<string, RejectionRecord>();
  for (const raw of rawRejections) {
    const key = `${normalizeCompanyKey(raw.company)}:::${normalizeKey(raw.title)}`;
    const existing = rejectionByKey.get(key);

    if (!existing) {
      rejectionByKey.set(key, {
        title: raw.title,
        company: raw.company,
        reason: raw.reason,
        evaluatedAt: raw.evaluatedAt,
        firstSeenAt: raw.evaluatedAt,
        timesSeen: 1,
        reportFile: raw.reportFile,
      });
      continue;
    }

    existing.timesSeen += 1;
    if (raw.evaluatedAt < existing.firstSeenAt) existing.firstSeenAt = raw.evaluatedAt;
    if (compareEvaluation(raw.evaluatedAt, raw.reportFile, existing.evaluatedAt, existing.reportFile) > 0) {
      existing.title = raw.title;
      existing.company = raw.company;
      existing.reason = raw.reason;
      existing.evaluatedAt = raw.evaluatedAt;
      existing.reportFile = raw.reportFile;
    }
  }

  // ---- Secondary dedupe: the same job cross-posted under different URLs ----
  // (e.g. RemoteOK mirror vs. the company's own careers page) is merged by
  // normalized company + title, keeping the newest evaluation's details.
  const byCompanyTitle = new Map<string, MatchedJobRecord[]>();
  for (const match of matchByKey.values()) {
    const key = `${normalizeCompanyKey(match.company)}:::${normalizeKey(match.title)}`;
    const group = byCompanyTitle.get(key);
    if (group) group.push(match);
    else byCompanyTitle.set(key, [match]);
  }

  for (const group of byCompanyTitle.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) =>
      compareEvaluation(b.evaluatedAt, b.reportFile, a.evaluatedAt, a.reportFile)
    );
    const winner = group[0];
    for (const loser of group.slice(1)) {
      for (const entry of loser.history) {
        if (!winner.history.some((h) => h.date === entry.date && h.reportFile === entry.reportFile)) {
          winner.history.push(entry);
        }
      }
      const loserKey =
        normalizeUrl(loser.url) || `${normalizeCompanyKey(loser.company)}:::${normalizeKey(loser.title)}`;
      matchByKey.delete(loserKey);
    }
    winner.history.sort((a, b) =>
      compareEvaluation(b.date, b.reportFile, a.date, a.reportFile)
    );
    winner.timesEvaluated = winner.history.length;
    winner.firstSeenAt = winner.history.reduce(
      (min, h) => (h.date < min ? h.date : min),
      winner.history[0].date
    );
  }

  // ---- Cross-status resolution: the newest evaluation decides matched vs rejected ----
  for (const [key, match] of [...matchByKey.entries()]) {
    const rejectionKey = `${normalizeCompanyKey(match.company)}:::${normalizeKey(match.title)}`;
    const rejection = rejectionByKey.get(rejectionKey);
    if (!rejection) continue;
    if (
      compareEvaluation(rejection.evaluatedAt, rejection.reportFile, match.evaluatedAt, match.reportFile) > 0
    ) {
      matchByKey.delete(key);
    } else {
      rejectionByKey.delete(rejectionKey);
    }
  }

  const matches = [...matchByKey.values()].sort((a, b) => b.matchScore - a.matchScore);
  const rejections = [...rejectionByKey.values()].sort((a, b) =>
    compareEvaluation(b.evaluatedAt, b.reportFile, a.evaluatedAt, a.reportFile)
  );
  reports.sort((a, b) => compareEvaluation(b.date, b.file, a.date, a.file));

  return { matches, rejections, reports };
}

/**
 * Backwards-compatible wrapper around parseAllReports (flat matches/rejections).
 * @deprecated Use parseAllReports() to also get the report timeline.
 */
export function parseReportsFromDir(dirPath: string): {
  matches: MatchedJobRecord[];
  rejections: RejectionRecord[];
} {
  const { matches, rejections } = parseAllReports(dirPath);
  return { matches, rejections };
}

/**
 * Compute the "first → latest" evaluation span across all historical matches
 */
export function computeHistorySpan(matches: MatchedJobRecord[]): string {
  if (matches.length === 0) return "—";
  const first = matches.reduce(
    (min, m) => (m.firstSeenAt < min ? m.firstSeenAt : min),
    matches[0].firstSeenAt
  );
  const latest = matches.reduce(
    (max, m) => (m.evaluatedAt > max ? m.evaluatedAt : max),
    matches[0].evaluatedAt
  );
  return `${first} → ${latest}`;
}

/**
 * Build aggregated data bundle combining crawled JDs and evaluated matches
 */
export function buildDashboardDataBundle(
  matchesDir = DEFAULT_MATCHES_DIR,
  jdsDir = DEFAULT_JDS_DIR
): DashboardDataBundle {
  const { matches, rejections, reports } = parseAllReports(matchesDir);
  const crawledJds = getAllCrawledJds(jdsDir);

  const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);
  const topMatches = sortedMatches.filter((m) => m.matchScore >= 8.5).length;
  const avgScore = sortedMatches.length
    ? (sortedMatches.reduce((acc, m) => acc + m.matchScore, 0) / sortedMatches.length).toFixed(1)
    : "0.0";
  const updatedAt = formatLocalDate();

  return {
    updatedAt,
    stats: {
      totalCrawled: crawledJds.length,
      totalMatched: sortedMatches.length,
      topMatches,
      avgScore,
      totalVetoed: rejections.length,
      totalReports: reports.length,
      historySpan: computeHistorySpan(sortedMatches),
    },
    reports,
    matches: sortedMatches,
    rejections,
    crawledJds,
  };
}

/**
 * Generate a dynamic Kami-styled HTML dashboard shell
 */
export function generateDashboardHtml(
  matches: MatchedJobRecord[] = [],
  rejections: RejectionRecord[] = [],
  crawledJds: CrawledJobSummary[] = [],
  reports: ReportSummary[] = []
): string {
  const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);
  const topMatches = sortedMatches.filter((m) => m.matchScore >= 8.5).length;
  const avgScore = sortedMatches.length
    ? (sortedMatches.reduce((acc, m) => acc + m.matchScore, 0) / sortedMatches.length).toFixed(1)
    : "0.0";
  const updatedAt = formatLocalDate();

  const initialBundle: DashboardDataBundle = {
    updatedAt,
    stats: {
      totalCrawled: crawledJds.length,
      totalMatched: sortedMatches.length,
      topMatches,
      avgScore,
      totalVetoed: rejections.length,
      totalReports: reports.length,
      historySpan: computeHistorySpan(sortedMatches),
    },
    reports,
    matches: sortedMatches,
    rejections,
    crawledJds,
  };

  const initialBundleJson = JSON.stringify(initialBundle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>JD Matcher</title>
  <style>
    /* ==========================================================================
       Kami Design System Tokens
       Warm Parchment, Single Ink-Blue Accent, Editorial Serif Typography
       ========================================================================== */
    :root {
      --parchment:      #f5f4ed;   /* Page background - warm cream canvas */
      --ivory:          #faf9f5;   /* Quiet filled container */
      --inline-code-bg: #f0eee6;   /* Annotation surface */
      --warm-sand:      #e8e6dc;   /* Interactive / button surface */
      --line:           #d8d5c8;

      --brand:          #1B365D;   /* Ink Blue - the single chromatic accent */
      --brand-light:    #2D5A8A;   /* Ink Light */
      --brand-tint:     #EEF2F7;   /* Lightest fill */
      --tag-bg:         #E4ECF5;   /* Solid tag swatch */

      --near-black:     #141413;   /* Primary text - warm olive undertone */
      --dark-warm:      #3d3d3a;   /* Secondary text */
      --olive:          #504e49;   /* Subtext */
      --stone:          #6b6a64;   /* Tertiary text, dates */

      --border:         #e8e6dc;   /* Primary border */
      --border-soft:    #e5e3d8;   /* Subtle divider */

      --breaking-bg:    #f0e0d8;   /* Muted warm peach */
      --breaking-fg:    #8b4513;   /* Warm brown */

      --serif: Charter, "Bitstream Charter", "TsangerJinKai02", "Source Han Serif SC",
               "Source Han Serif CN", "Noto Serif", Georgia, serif;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --mono: "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace;
    }

    [data-theme="dark"] {
      --parchment:      #141413;   /* Deep warm charcoal */
      --ivory:          #1c1c1a;   /* Quiet dark card */
      --inline-code-bg: #242422;
      --warm-sand:      #2c2c29;
      --line:           #383834;

      --brand:          #396fa8;
      --brand-light:    #5286bf;
      --brand-tint:     #1d2a38;
      --tag-bg:         #1d2d40;

      --near-black:     #f5f4ed;
      --dark-warm:      #e2dfd5;
      --olive:          #a8a69d;
      --stone:          #85837a;

      --border:         #33322e;
      --border-soft:    #2a2926;

      --breaking-bg:    #3a241b;
      --breaking-fg:    #e08c62;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: var(--parchment);
      color: var(--near-black);
      font-family: var(--serif);
      font-size: 15px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transition: background 0.2s ease, color 0.2s ease;
    }

    a {
      color: var(--brand);
      text-decoration: none;
      transition: color 0.15s;
    }
    a:hover { color: var(--brand-light); }

    /* Layout */
    .page-container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }

    /* Header */
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-main {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logo-badge {
      width: 46px;
      height: 46px;
      border-radius: 10px;
      background: var(--brand);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--brand-light);
      box-shadow: 0 2px 8px rgba(27, 54, 93, 0.18);
      flex-shrink: 0;
      transition: transform 0.15s ease, background 0.2s ease;
    }
    .logo-badge:hover {
      transform: scale(1.03);
    }
    .title-group {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .title-group h1 {
      font-size: 26px;
      font-weight: 500;
      color: var(--near-black);
      letter-spacing: -0.3px;
      line-height: 1.15;
      margin: 0;
    }
    .subtitle {
      font-family: var(--sans);
      font-size: 13px;
      color: var(--stone);
      margin-top: 3px;
      margin-bottom: 0;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--sans);
      font-size: 12px;
    }
    .date-pill {
      background: var(--ivory);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 999px;
      color: var(--olive);
      font-variant-numeric: tabular-nums;
    }
    .theme-toggle-btn {
      background: var(--ivory);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 999px;
      color: var(--dark-warm);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--sans);
      transition: background 0.15s;
    }
    .theme-toggle-btn:hover { background: var(--warm-sand); }

    /* KPI Metrics */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .metric-card {
      background: var(--ivory);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px 20px;
    }
    .metric-label {
      font-family: var(--sans);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--stone);
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: 28px;
      font-weight: 500;
      color: var(--near-black);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .metric-note {
      font-family: var(--sans);
      font-size: 11px;
      color: var(--olive);
      margin-top: 6px;
    }

    /* Tabs Navigation */
    .tabs-bar {
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      padding-bottom: 1px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 10px 16px;
      font-family: var(--sans);
      font-size: 13.5px;
      font-weight: 500;
      color: var(--stone);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-btn:hover {
      color: var(--dark-warm);
    }
    .tab-btn.active {
      color: var(--brand);
      border-bottom-color: var(--brand);
      font-weight: 600;
    }
    .tab-badge {
      background: var(--warm-sand);
      color: var(--dark-warm);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      font-variant-numeric: tabular-nums;
    }
    .tab-btn.active .tab-badge {
      background: var(--tag-bg);
      color: var(--brand);
    }

    /* Filter Toolbar */
    .filter-toolbar {
      background: var(--ivory);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 28px;
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-box {
      flex: 1;
      min-width: 260px;
      position: relative;
    }
    .search-input {
      width: 100%;
      background: var(--parchment);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 14px;
      font-family: var(--sans);
      font-size: 13px;
      color: var(--near-black);
      outline: none;
      transition: border-color 0.15s;
    }
    .search-input:focus {
      border-color: var(--brand);
    }
    .select-filter {
      background: var(--parchment);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: var(--sans);
      font-size: 13px;
      color: var(--dark-warm);
      outline: none;
      cursor: pointer;
    }
    .results-count {
      font-family: var(--sans);
      font-size: 12px;
      color: var(--stone);
      margin-left: auto;
    }

    /* Views */
    .tab-view { display: none; }
    .tab-view.active { display: block; }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
      gap: 20px;
      margin-bottom: 48px;
    }
    @media (max-width: 600px) {
      .cards-grid { grid-template-columns: 1fr; }
    }
    .kami-card {
      background: var(--ivory);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .kami-card:hover {
      border-color: var(--line);
      box-shadow: 0 4px 12px rgba(20, 20, 19, 0.04);
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .company-label {
      font-family: var(--sans);
      font-size: 12px;
      font-weight: 500;
      color: var(--brand);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .job-title {
      font-size: 18px;
      font-weight: 500;
      line-height: 1.3;
      margin-top: 3px;
    }
    .job-title a {
      color: var(--near-black);
    }
    .job-title a:hover {
      color: var(--brand);
    }
    .score-container {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .score-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-family: var(--sans);
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .date-label {
      font-family: var(--sans);
      font-size: 11px;
      color: var(--stone);
      margin-top: 4px;
    }

    /* Tags */
    .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .kami-tag {
      font-family: var(--sans);
      font-size: 11px;
      background: var(--tag-bg);
      color: var(--brand);
      padding: 3px 8px;
      border-radius: 4px;
      line-height: 1.3;
      cursor: pointer;
      transition: background 0.15s;
    }
    .kami-tag:hover {
      background: #c8daf0;
    }
    .salary-tag {
      background: #e5ece5;
      color: #2b562b;
      cursor: default;
    }
    [data-theme="dark"] .salary-tag {
      background: #1e2c1e;
      color: #79ac79;
    }
    .source-tag {
      background: var(--warm-sand);
      color: var(--stone);
      cursor: default;
    }

    /* Callout Boxes */
    .callout-box {
      background: var(--inline-code-bg);
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .why-box {
      border-left: 3px solid var(--brand);
    }
    .tips-box {
      border-left: 3px solid var(--stone);
    }
    .callout-title {
      font-family: var(--sans);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--dark-warm);
      margin-bottom: 4px;
    }
    .callout-bullet {
      color: var(--brand);
      margin-right: 4px;
    }
    .callout-text {
      font-size: 13.5px;
      line-height: 1.5;
      color: var(--dark-warm);
    }

    /* Card Footer */
    .card-footer {
      border-top: 1px solid var(--border-soft);
      padding-top: 14px;
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      font-family: var(--sans);
    }
    /* Left metadata block shrinks/truncates instead of squeezing the button */
    .card-footer > div {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }
    .path-label {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--stone);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--brand);
      color: #faf9f5 !important;
      font-family: var(--sans);
      font-size: 12.5px;
      font-weight: 500;
      padding: 7px 18px;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      flex: 0 0 auto;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-primary:hover {
      background: var(--brand-light);
      transform: translateY(-1px);
    }
    .btn-primary .arrow {
      font-size: 13px;
    }

    /* Veto Audit Table */
    .audit-section {
      background: var(--ivory);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 48px;
    }
    .audit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .audit-title {
      font-size: 18px;
      font-weight: 500;
      color: var(--near-black);
    }
    .audit-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--sans);
      font-size: 12.5px;
    }
    .audit-th {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--stone);
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .audit-td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--border-soft);
      color: var(--dark-warm);
    }
    .breaking-badge {
      display: inline-block;
      background: var(--breaking-bg);
      color: var(--breaking-fg);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 500;
    }

    .empty-state {
      background: var(--ivory);
      border: 1px dashed var(--border);
      border-radius: 10px;
      padding: 48px 24px;
      text-align: center;
      color: var(--stone);
      font-family: var(--sans);
    }
    .empty-icon { font-size: 28px; margin-bottom: 8px; }

    /* Evaluation date grouping (cumulative history) */
    .date-section { margin-bottom: 44px; }
    .date-section-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .date-heading {
      font-size: 19px;
      font-weight: 500;
      color: var(--near-black);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.2px;
    }
    .date-hint {
      font-family: var(--sans);
      font-size: 12px;
      color: var(--stone);
      min-width: 0;
      max-width: 46%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .date-count {
      font-family: var(--sans);
      font-size: 12px;
      color: var(--stone);
      margin-left: auto;
    }
    .date-section .cards-grid { margin-bottom: 0; }
    .repeat-badge {
      display: inline-block;
      background: var(--brand-tint);
      color: var(--brand);
      border: 1px solid var(--tag-bg);
      padding: 2px 7px;
      border-radius: 999px;
      font-family: var(--sans);
      font-size: 10.5px;
      font-weight: 600;
      margin-top: 5px;
    }
    .eval-chip {
      font-family: var(--sans);
      font-size: 11px;
      color: var(--stone);
      margin-top: 6px;
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Report timeline */
    .history-list { display: flex; flex-direction: column; gap: 10px; }
    .history-row {
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--parchment);
      border: 1px solid var(--border-soft);
      border-radius: 8px;
      padding: 12px 16px;
      font-family: var(--sans);
      font-size: 13px;
      color: var(--dark-warm);
    }
    .history-date {
      font-weight: 600;
      color: var(--brand);
      font-variant-numeric: tabular-nums;
      min-width: 92px;
    }
    .history-file {
      font-family: var(--mono);
      font-size: 11.5px;
      color: var(--stone);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .history-counts { display: flex; gap: 8px; }

    footer {
      border-top: 1px solid var(--border);
      margin-top: 56px;
      padding-top: 24px;
      text-align: center;
      font-family: var(--sans);
      font-size: 12px;
      color: var(--stone);
    }
    footer a { color: var(--brand); }
  </style>

  <!-- External or local data loader -->
  <script src="data.js"></script>
</head>
<body>
  <div class="page-container">

    <!-- Header -->
    <header>
      <div class="header-main">
        <div class="logo-badge" title="JD Matcher · AI Job Matching Engine">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Job Description Document Card -->
            <rect x="5" y="4" width="16" height="22" rx="3" stroke="#FAF9F5" stroke-width="2" fill="none"/>
            <path d="M9 10H15M9 15H17M9 20H13" stroke="#FAF9F5" stroke-width="1.75" stroke-linecap="round"/>
            <!-- AI Matching Lens / Target Badge -->
            <circle cx="21" cy="20" r="6" fill="var(--brand)" stroke="#FAF9F5" stroke-width="2"/>
            <!-- Precision Match Checkmark -->
            <path d="M18.5 20L20.2 21.7L23.7 18.2" stroke="#FAF9F5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="title-group">
          <h1>JD Matcher</h1>
          <div class="subtitle">AI-Powered JD & Resume Match Engine · Curated Remote Opportunities</div>
        </div>
      </div>
      <div class="header-actions">
        <button id="themeToggle" class="theme-toggle-btn" title="Toggle warm dark mode">Theme: Parchment</button>
        <span id="datePill" class="date-pill">Updated: ${updatedAt}</span>
      </div>
    </header>

    <!-- KPI Metric Cards -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Recommended Matches</div>
        <div id="statMatched" class="metric-value">0</div>
        <div class="metric-note">Score ≥ 6.0 Approved</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Top Matches (≥ 8.5)</div>
        <div id="statTop" class="metric-value" style="color: var(--brand);">0</div>
        <div class="metric-note">High conviction alignment</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Knowledge Base (Crawled)</div>
        <div id="statCrawled" class="metric-value">0</div>
        <div class="metric-note">Markdown JDs in data/jds</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Hard Veto Filtered</div>
        <div id="statVetoed" class="metric-value" style="color: var(--breaking-fg);">0</div>
        <div class="metric-note">Excluded via constraints</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Reports Aggregated</div>
        <div id="statReports" class="metric-value">0</div>
        <div class="metric-note">data/matches (incl. archive/)</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">History Span</div>
        <div id="statSpan" class="metric-value" style="font-size: 19px; line-height: 1.5;">—</div>
        <div class="metric-note">First → latest evaluation</div>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tabs-bar">
      <button class="tab-btn active" data-tab="matches">
        <span>🎯 Matched Recommendations</span>
        <span id="badgeMatched" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="crawled">
        <span>📚 All Crawled Jobs</span>
        <span id="badgeCrawled" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="history">
        <span>📜 Evaluation History</span>
        <span id="badgeHistory" class="tab-badge">0</span>
      </button>
      <button class="tab-btn" data-tab="audit">
        <span>⛔ Excluded Audit Log</span>
        <span id="badgeAudit" class="tab-badge">0</span>
      </button>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="filter-toolbar">
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="Search by title, company, or skills...">
      </div>
      <select id="scoreFilter" class="select-filter">
        <option value="0">All Scores (≥ 6.0)</option>
        <option value="9">Top Match (≥ 9.0)</option>
        <option value="8">Good Fit (≥ 8.0)</option>
        <option value="7">Above 7.0</option>
      </select>
      <select id="sourceFilter" class="select-filter" style="display: none;">
        <option value="all">All Sources</option>
        <option value="remoteok">RemoteOK</option>
        <option value="weworkremotely">WeWorkRemotely</option>
      </select>
      <span id="resultsCount" class="results-count">0 items</span>
    </div>

    <!-- Tab View 1: Matched Recommendations (grouped by evaluation date) -->
    <section id="matchesView" class="tab-view active">
      <div id="matchesGrid"></div>
    </section>

    <!-- Tab View 2: All Crawled Jobs in Knowledge Base -->
    <section id="crawledView" class="tab-view">
      <div id="crawledGrid" class="cards-grid"></div>
    </section>

    <!-- Tab View 3: Evaluation History (report timeline) -->
    <section id="historyView" class="tab-view">
      <div class="audit-section">
        <div class="audit-header">
          <h2 class="audit-title">Match Report Timeline</h2>
          <span id="historyCountBadge" class="tab-badge">0 reports</span>
        </div>
        <div id="historyList" class="history-list"></div>
      </div>
    </section>

    <!-- Tab View 4: Veto Audit Log -->
    <section id="auditView" class="tab-view">
      <div class="audit-section">
        <div class="audit-header">
          <h2 class="audit-title">Hard Constraint Exclusions (Audit Log)</h2>
          <span id="auditCountBadge" class="breaking-badge">0 JDs vetoed</span>
        </div>
        <table class="audit-table">
          <thead>
            <tr>
              <th class="audit-th">Role Title</th>
              <th class="audit-th">Company</th>
              <th class="audit-th">Reason for Exclusion</th>
            </tr>
          </thead>
          <tbody id="auditTableBody"></tbody>
        </table>
      </div>
    </section>

    <!-- Footer -->
    <footer>
      Styled with <a href="https://github.com/tw93/kami" target="_blank" rel="noopener noreferrer">Kami</a> Design System · Warm Parchment, Ink-Blue Accent & Serif Hierarchy
    </footer>

  </div>

  <!-- Fallback / Inline Seed Data -->
  <script id="seedData" type="application/json">
${initialBundleJson}
  </script>

  <!-- Dynamic Dashboard Client Engine -->
  <script>
    (function () {
      // 1. Resolve dataset: external data.js > /api/data fetch > inline seed data
      let db = window.__JD_DASHBOARD_DATA__;
      if (!db) {
        try {
          const seedEl = document.getElementById('seedData');
          if (seedEl && seedEl.textContent.trim()) {
            db = JSON.parse(seedEl.textContent.trim());
          }
        } catch (e) {
          console.warn('Could not parse inline seed data', e);
        }
      }

      if (!db) {
        db = {
          updatedAt: new Date().toISOString().split('T')[0],
          stats: { totalCrawled: 0, totalMatched: 0, topMatches: 0, avgScore: "0.0", totalVetoed: 0, totalReports: 0, historySpan: "—" },
          reports: [],
          matches: [],
          rejections: [],
          crawledJds: []
        };
      }

      // DOM references
      const statMatched = document.getElementById('statMatched');
      const statTop = document.getElementById('statTop');
      const statCrawled = document.getElementById('statCrawled');
      const statVetoed = document.getElementById('statVetoed');
      const statReports = document.getElementById('statReports');
      const statSpan = document.getElementById('statSpan');
      const datePill = document.getElementById('datePill');

      const badgeMatched = document.getElementById('badgeMatched');
      const badgeCrawled = document.getElementById('badgeCrawled');
      const badgeHistory = document.getElementById('badgeHistory');
      const badgeAudit = document.getElementById('badgeAudit');
      const auditCountBadge = document.getElementById('auditCountBadge');
      const historyCountBadge = document.getElementById('historyCountBadge');

      const searchInput = document.getElementById('searchInput');
      const scoreFilter = document.getElementById('scoreFilter');
      const sourceFilter = document.getElementById('sourceFilter');
      const resultsCount = document.getElementById('resultsCount');

      const matchesGrid = document.getElementById('matchesGrid');
      const crawledGrid = document.getElementById('crawledGrid');
      const auditTableBody = document.getElementById('auditTableBody');
      const historyList = document.getElementById('historyList');

      let currentTab = 'matches';

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      // Render KPI Metrics
      function updateStats() {
        statMatched.textContent = db.matches.length;
        statTop.textContent = db.matches.filter(m => m.matchScore >= 8.5).length;
        statCrawled.textContent = db.crawledJds.length;
        statVetoed.textContent = db.rejections.length;
        statReports.textContent = (db.reports || []).length;
        statSpan.textContent = (db.stats && db.stats.historySpan) || '—';
        if (db.updatedAt) datePill.textContent = 'Updated: ' + db.updatedAt;

        badgeMatched.textContent = db.matches.length;
        badgeCrawled.textContent = db.crawledJds.length;
        badgeHistory.textContent = (db.reports || []).length;
        badgeAudit.textContent = db.rejections.length;
        auditCountBadge.textContent = db.rejections.length + ' JDs vetoed';
      }

      // Build a single matched-job card
      function renderMatchCard(job) {
        let scoreBadgeStyle = "background: #e8e6dc; color: #3d3d3a; border: 1px solid #d8d5c8;";
        if (job.matchScore >= 9.0) {
          scoreBadgeStyle = "background: #1B365D; color: #faf9f5; border: 1px solid #1B365D;";
        } else if (job.matchScore >= 8.0) {
          scoreBadgeStyle = "background: #E4ECF5; color: #1B365D; border: 1px solid #c7d8eb;";
        }

        const locTags = (job.locations || []).slice(0, 3).map(l =>
          \`<span class="kami-tag" onclick="window.filterByKeyword('\${escapeHtml(l)}')">\${escapeHtml(l)}</span>\`
        ).join(' ');

        const repeatBadge = (job.timesEvaluated || 1) > 1
          ? \`<span class="repeat-badge" title="Recommended in \${job.timesEvaluated} reports">↻ \${job.timesEvaluated}× evaluated</span>\`
          : '';

        return \`
            <div class="kami-card">
              <div class="card-body">
                <div class="card-header-row">
                  <div>
                    <div class="company-label">\${escapeHtml(job.company)}</div>
                    <h3 class="job-title">
                      <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(job.title)}</a>
                    </h3>
                  </div>
                  <div class="score-container">
                    <span class="score-badge" style="\${scoreBadgeStyle}">\${Number(job.matchScore).toFixed(1)} / 10</span>
                    <span class="date-label">\${escapeHtml(job.postedAt)}</span>
                    \${repeatBadge}
                  </div>
                </div>

                <div class="tags-row">
                  \${locTags}
                  \${job.salary && job.salary !== 'Not specified' ? \`<span class="kami-tag salary-tag">\${escapeHtml(job.salary)}</span>\` : ''}
                  <span class="kami-tag source-tag">\${escapeHtml(job.source)}</span>
                </div>

                <div class="callout-box why-box">
                  <div class="callout-title"><span class="callout-bullet">✦</span> Why It Matches</div>
                  <p class="callout-text">\${escapeHtml(job.whyMatch)}</p>
                </div>

                <div class="callout-box tips-box">
                  <div class="callout-title tips-title"><span class="callout-bullet">↳</span> Application & Interview Tips</div>
                  <p class="callout-text">\${escapeHtml(job.tips)}</p>
                </div>
              </div>

              <div class="card-footer">
                <div>
                  <div class="path-label">\${escapeHtml(job.localPath || '')}</div>
                  <div class="eval-chip">Evaluated \${escapeHtml(job.evaluatedAt || '')}\${job.reportFile ? ' · ' + escapeHtml(job.reportFile) : ''}</div>
                </div>
                <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
                  <span>Apply Now</span>
                  <span class="arrow">↗</span>
                </a>
              </div>
            </div>
          \`;
      }

      // Render Matched Recommendations View, grouped by evaluation date (newest run first)
      function renderMatches() {
        const query = (searchInput.value || '').toLowerCase().trim();
        const minScore = parseFloat(scoreFilter.value) || 0;

        const filtered = db.matches.filter(job => {
          const title = (job.title || '').toLowerCase();
          const comp = (job.company || '').toLowerCase();
          const why = (job.whyMatch || '').toLowerCase();
          const locs = (job.locations || []).join(' ').toLowerCase();

          const matchesQuery = !query || title.includes(query) || comp.includes(query) || why.includes(query) || locs.includes(query);
          const matchesScore = (job.matchScore || 0) >= minScore;
          return matchesQuery && matchesScore;
        });

        resultsCount.textContent = filtered.length + ' matches';

        if (filtered.length === 0) {
          matchesGrid.innerHTML = \`
            <div class="empty-state">
              <div class="empty-icon">🍃</div>
              <p>No matching recommendations found for current filters.</p>
            </div>
          \`;
          return;
        }

        const groups = {};
        filtered.forEach(job => {
          const date = job.evaluatedAt || 'Unknown date';
          if (!groups[date]) groups[date] = [];
          groups[date].push(job);
        });

        matchesGrid.innerHTML = Object.keys(groups)
          .sort((a, b) => (a < b ? 1 : -1))
          .map(date => {
            const jobs = groups[date].slice().sort((a, b) => b.matchScore - a.matchScore);
            const reportFiles = Array.from(new Set(jobs.map(j => j.reportFile).filter(Boolean)));
            const hint = reportFiles.length === 1
              ? reportFiles[0]
              : (reportFiles.length ? reportFiles.length + ' reports merged' : '');
            return \`
              <section class="date-section">
                <div class="date-section-header">
                  <h2 class="date-heading">\${escapeHtml(date)}</h2>
                  <span class="date-hint">\${escapeHtml(hint)}</span>
                  <span class="date-count">\${jobs.length} match\${jobs.length > 1 ? 'es' : ''}</span>
                </div>
                <div class="cards-grid">\${jobs.map(renderMatchCard).join('')}</div>
              </section>
            \`;
          })
          .join('');
      }

      // Render the report timeline (Evaluation History tab)
      function renderHistory() {
        const reports = (db.reports || []).slice().sort((a, b) =>
          (a.date + a.file) < (b.date + b.file) ? 1 : -1
        );
        historyCountBadge.textContent = reports.length + ' report' + (reports.length === 1 ? '' : 's');
        resultsCount.textContent = reports.length + ' reports aggregated';

        if (reports.length === 0) {
          historyList.innerHTML = \`
            <div class="empty-state">
              <div class="empty-icon">📜</div>
              <p>No match reports found in data/matches (incl. archive/).</p>
            </div>
          \`;
          return;
        }

        historyList.innerHTML = reports.map(r => \`
          <div class="history-row">
            <span class="history-date">\${escapeHtml(r.date)}</span>
            <span class="history-file" title="\${escapeHtml(r.file)}">\${escapeHtml(r.file)}</span>
            <span class="history-counts">
              <span class="breaking-badge" style="background: var(--tag-bg); color: var(--brand);">\${r.matched} matched</span>
              <span class="breaking-badge">\${r.rejected} vetoed</span>
            </span>
          </div>
        \`).join('');
      }

      // Render All Crawled Knowledge Base View
      function renderCrawled() {
        const query = (searchInput.value || '').toLowerCase().trim();
        const sourceVal = sourceFilter.value;

        const filtered = db.crawledJds.filter(job => {
          const title = (job.title || '').toLowerCase();
          const comp = (job.company || '').toLowerCase();
          const tags = (job.tags || []).join(' ').toLowerCase();
          const locs = (job.locations || []).join(' ').toLowerCase();

          const matchesQuery = !query || title.includes(query) || comp.includes(query) || tags.includes(query) || locs.includes(query);
          const matchesSource = sourceVal === 'all' || (job.source || '').toLowerCase().includes(sourceVal);
          return matchesQuery && matchesSource;
        });

        resultsCount.textContent = filtered.length + ' JDs in knowledge base';

        if (filtered.length === 0) {
          crawledGrid.innerHTML = \`
            <div class="empty-state" style="grid-column: 1 / -1;">
              <div class="empty-icon">📂</div>
              <p>No jobs found in knowledge base matching current search.</p>
            </div>
          \`;
          return;
        }

        crawledGrid.innerHTML = filtered.map(job => {
          const tagPills = (job.tags || []).slice(0, 5).map(t =>
            \`<span class="kami-tag" onclick="window.filterByKeyword('\${escapeHtml(t)}')">\${escapeHtml(t)}</span>\`
          ).join(' ');

          const locPills = (job.locations || []).slice(0, 2).map(l =>
            \`<span class="kami-tag" style="background: var(--warm-sand); color: var(--stone);">\${escapeHtml(l)}</span>\`
          ).join(' ');

          return \`
            <div class="kami-card">
              <div class="card-body">
                <div class="card-header-row">
                  <div>
                    <div class="company-label">\${escapeHtml(job.company)}</div>
                    <h3 class="job-title">
                      <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(job.title)}</a>
                    </h3>
                  </div>
                  <div class="score-container">
                    <span class="date-label" style="font-weight: 500;">\${escapeHtml(job.postedAt)}</span>
                    <span class="kami-tag source-tag" style="margin-top: 4px;">\${escapeHtml(job.source)}</span>
                  </div>
                </div>

                <div class="tags-row">
                  \${locPills}
                  \${job.salary && job.salary !== 'Not specified' ? \`<span class="kami-tag salary-tag">\${escapeHtml(job.salary)}</span>\` : ''}
                </div>

                <div style="margin-bottom: 14px;">
                  <div style="font-family: var(--sans); font-size: 11px; text-transform: uppercase; color: var(--stone); margin-bottom: 6px; letter-spacing: 0.5px;">Skill Tags</div>
                  <div class="tags-row">\${tagPills || '<span style="font-size: 11px; color: var(--stone);">No tags listed</span>'}</div>
                </div>
              </div>

              <div class="card-footer">
                <div class="path-label">\${escapeHtml(job.relPath || '')}</div>
                <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
                  <span>View Posting</span>
                  <span class="arrow">↗</span>
                </a>
              </div>
            </div>
          \`;
        }).join('');
      }

      // Render Rejections Audit View
      function renderAudit() {
        const query = (searchInput.value || '').toLowerCase().trim();
        const filtered = db.rejections.filter(r => {
          const t = (r.title || '').toLowerCase();
          const c = (r.company || '').toLowerCase();
          const re = (r.reason || '').toLowerCase();
          return !query || t.includes(query) || c.includes(query) || re.includes(query);
        });

        resultsCount.textContent = filtered.length + ' vetoed records';

        if (filtered.length === 0) {
          auditTableBody.innerHTML = \`
            <tr><td colspan="3" class="audit-td" style="text-align: center; color: var(--stone);">No excluded records found.</td></tr>
          \`;
          return;
        }

        auditTableBody.innerHTML = filtered.map(r => \`
          <tr class="audit-row">
            <td class="audit-td" style="font-weight: 500;">\${escapeHtml(r.title)}</td>
            <td class="audit-td" style="color: var(--olive);">\${escapeHtml(r.company)}</td>
            <td class="audit-td">
              <span class="breaking-badge">\${escapeHtml(r.reason)}</span>
            </td>
          </tr>
        \`).join('');
      }

      function updateActiveView() {
        if (currentTab === 'matches') {
          scoreFilter.style.display = 'inline-block';
          sourceFilter.style.display = 'none';
          renderMatches();
        } else if (currentTab === 'crawled') {
          scoreFilter.style.display = 'none';
          sourceFilter.style.display = 'inline-block';
          renderCrawled();
        } else if (currentTab === 'history') {
          scoreFilter.style.display = 'none';
          sourceFilter.style.display = 'none';
          renderHistory();
        } else if (currentTab === 'audit') {
          scoreFilter.style.display = 'none';
          sourceFilter.style.display = 'none';
          renderAudit();
        }
      }

      // Click to filter helper
      window.filterByKeyword = function (kw) {
        searchInput.value = kw;
        updateActiveView();
      };

      // Tab switcher
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

          btn.classList.add('active');
          currentTab = btn.getAttribute('data-tab');

          if (currentTab === 'matches') document.getElementById('matchesView').classList.add('active');
          if (currentTab === 'crawled') document.getElementById('crawledView').classList.add('active');
          if (currentTab === 'history') document.getElementById('historyView').classList.add('active');
          if (currentTab === 'audit') document.getElementById('auditView').classList.add('active');

          updateActiveView();
        });
      });

      searchInput.addEventListener('input', updateActiveView);
      scoreFilter.addEventListener('change', updateActiveView);
      sourceFilter.addEventListener('change', updateActiveView);

      // Theme toggle
      const themeBtn = document.getElementById('themeToggle');
      let isDark = false;
      themeBtn.addEventListener('click', () => {
        isDark = !isDark;
        if (isDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          themeBtn.textContent = 'Theme: Deep Dark';
        } else {
          document.documentElement.removeAttribute('data-theme');
          themeBtn.textContent = 'Theme: Parchment';
        }
      });

      // Initial mount
      updateStats();
      updateActiveView();
    })();
  </script>
</body>
</html>`;
}

/**
 * Open HTML file in default browser
 */
export function openInBrowser(targetPath: string): void {
  const startCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";

  console.log(`[DASHBOARD] Opening dashboard in browser via ${startCmd}: ${targetPath}`);
  exec(`${startCmd} "${targetPath}"`, (err) => {
    if (err) {
      console.warn(`[DASHBOARD] Could not launch browser automatically:`, err.message);
      console.log(`[DASHBOARD] You can open it manually at: file://${targetPath}`);
    } else {
      console.log(`[DASHBOARD] Browser launched successfully!`);
    }
  });
}

/**
 * CLI Runner: Generates dynamic dataset bundle (data.json & data.js) and the HTML shell
 */
export function runDashboard(
  matchesDir = DEFAULT_MATCHES_DIR,
  jdsDir = DEFAULT_JDS_DIR,
  shouldOpen = false
): { htmlPath: string; jsonPath: string; jsPath: string } {
  console.log(`[DASHBOARD] Ingesting crawled JDs from: ${jdsDir}`);
  console.log(`[DASHBOARD] Ingesting match evaluations from: ${matchesDir}`);

  // Build unified dynamic dataset bundle
  const bundle = buildDashboardDataBundle(matchesDir, jdsDir);

  fs.mkdirSync(path.dirname(DASHBOARD_OUTPUT_PATH), { recursive: true });

  // 1. Save data.json (pure JSON export)
  fs.writeFileSync(DATA_JSON_PATH, JSON.stringify(bundle, null, 2), "utf-8");

  // 2. Save data.js (cross-origin / file:// compatible script)
  const jsContent = `window.__JD_DASHBOARD_DATA__ = ${JSON.stringify(bundle, null, 2)};\n`;
  fs.writeFileSync(DATA_JS_PATH, jsContent, "utf-8");

  // 3. Save dashboard.html (dynamic rendering shell)
  const html = generateDashboardHtml(
    bundle.matches,
    bundle.rejections,
    bundle.crawledJds,
    bundle.reports
  );
  fs.writeFileSync(DASHBOARD_OUTPUT_PATH, html, "utf-8");

  console.log(`[DASHBOARD] Successfully written:`);
  console.log(`  - HTML Shell:   ${DASHBOARD_OUTPUT_PATH}`);
  console.log(`  - JSON Dataset: ${DATA_JSON_PATH}`);
  console.log(`  - JS Loader:    ${DATA_JS_PATH}`);
  console.log(`- Reports Aggregated:     ${bundle.stats.totalReports} (incl. archive/)`);
  console.log(`- History Span:           ${bundle.stats.historySpan}`);
  console.log(`- Total Crawled JDs:      ${bundle.stats.totalCrawled}`);
  console.log(`- Matched Opportunities:  ${bundle.stats.totalMatched}`);
  console.log(`- Excluded JDs:           ${bundle.stats.totalVetoed}`);

  if (shouldOpen) {
    openInBrowser(DASHBOARD_OUTPUT_PATH);
  }

  return { htmlPath: DASHBOARD_OUTPUT_PATH, jsonPath: DATA_JSON_PATH, jsPath: DATA_JS_PATH };
}

// CLI entry point
const isMain =
  Boolean(process.argv[1]) &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("dashboard.ts"));

if (isMain) {
  const args = process.argv.slice(2);
  const shouldOpen = args.includes("--open");
  runDashboard(DEFAULT_MATCHES_DIR, DEFAULT_JDS_DIR, shouldOpen);
}
