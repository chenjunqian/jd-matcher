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
       Frosted Workbench
       Warm neutral canvas · lime / apricot / ink accent cards · frosted glass
       ========================================================================== */
    :root {
      --canvas:        #EFEDE9;
      --canvas-deep:   #E3E0DA;

      --glass:         rgba(255, 255, 255, 0.58);
      --glass-strong:  rgba(255, 255, 255, 0.78);
      --glass-border:  rgba(255, 255, 255, 0.85);
      --glass-line:    rgba(20, 20, 19, 0.075);
      --panel:         rgba(250, 249, 245, 0.74);

      --ink:           #0D0D0D;
      --ink-2:         #1B1B1E;
      --ink-3:         #2A2A2E;

      --lime:          #F2EA2E;
      --lime-soft:     #F7F264;
      --lime-deep:     #DFD816;
      --apricot:       #FE9251;
      --apricot-deep:  #F5762F;
      --blue:          #1E82C2;

      --text:          #1A1A18;
      --text-2:        #5F5E58;
      --text-3:        #8B8A83;

      --r-xl: 28px;
      --r-lg: 22px;
      --r-md: 16px;
      --r-sm: 12px;
      --r-pill: 999px;

      --shadow-card: 0 22px 60px -38px rgba(24, 22, 18, 0.55), 0 2px 8px rgba(24, 22, 18, 0.03);
      --shadow-float: 0 16px 40px -22px rgba(24, 22, 18, 0.45);

      --sans: "Inter", "Helvetica Neue", Helvetica, -apple-system, BlinkMacSystemFont,
              "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      --mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;

      --ease: cubic-bezier(0.2, 0.8, 0.2, 1);

      /* legacy aliases kept for inline styles used by render helpers */
      --parchment: var(--canvas);
      --ivory: var(--glass);
      --near-black: var(--text);
      --dark-warm: var(--text-2);
      --olive: var(--text-2);
      --stone: var(--text-3);
      --brand: var(--text-2);
      --brand-light: var(--text);
      --border: var(--glass-line);
      --border-soft: var(--glass-line);
      --warm-sand: rgba(20, 20, 19, 0.055);
      --tag-bg: rgba(20, 20, 19, 0.055);
    }

    [data-theme="dark"] {
      --canvas:        #0E0E10;
      --canvas-deep:   #16161A;

      --glass:         rgba(255, 255, 255, 0.055);
      --glass-strong:  rgba(255, 255, 255, 0.1);
      --glass-border:  rgba(255, 255, 255, 0.12);
      --glass-line:    rgba(255, 255, 255, 0.09);
      --panel:         rgba(24, 24, 27, 0.82);

      --ink:           #17171A;
      --ink-2:         #1F1F23;
      --ink-3:         #2C2C31;

      --text:          #F2F1EC;
      --text-2:        #B4B2AA;
      --text-3:        #83817A;

      --shadow-card: 0 22px 60px -34px rgba(0, 0, 0, 0.9), 0 2px 8px rgba(0, 0, 0, 0.4);
      --shadow-float: 0 16px 40px -22px rgba(0, 0, 0, 0.85);

      --warm-sand: rgba(255, 255, 255, 0.09);
      --tag-bg: rgba(255, 255, 255, 0.09);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html { scroll-behavior: smooth; }

    body {
      background: var(--canvas);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.5;
      letter-spacing: -0.006em;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      min-height: 100vh;
      overflow-x: hidden;
      transition: background 0.3s ease, color 0.3s ease;
    }

    ::selection { background: rgba(242, 234, 46, 0.6); color: #111; }

    a { color: inherit; text-decoration: none; }
    button { font: inherit; color: inherit; }

    :focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

    /* ---------- Ambient gradient wash + film grain ---------- */
    body::before {
      content: "";
      position: fixed;
      inset: -25vmax;
      z-index: -2;
      pointer-events: none;
      background:
        radial-gradient(40vmax 36vmax at 10% 2%, rgba(226, 240, 64, 0.55), transparent 62%),
        radial-gradient(36vmax 32vmax at 88% 0%, rgba(255, 146, 81, 0.4), transparent 64%),
        radial-gradient(44vmax 38vmax at 82% 92%, rgba(150, 165, 255, 0.16), transparent 66%),
        radial-gradient(30vmax 26vmax at 26% 98%, rgba(255, 255, 255, 0.85), transparent 70%);
      filter: blur(14px);
      animation: drift 52s var(--ease) infinite alternate;
    }
    [data-theme="dark"] body::before {
      background:
        radial-gradient(40vmax 36vmax at 10% 2%, rgba(214, 226, 60, 0.14), transparent 62%),
        radial-gradient(36vmax 32vmax at 88% 0%, rgba(255, 146, 81, 0.16), transparent 64%),
        radial-gradient(44vmax 38vmax at 82% 92%, rgba(110, 130, 255, 0.12), transparent 66%);
    }
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      opacity: 0.035;
      mix-blend-mode: multiply;
      background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
    }
    [data-theme="dark"] body::after { opacity: 0.05; mix-blend-mode: screen; }

    @keyframes drift {
      0%   { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(2%, -1.6%, 0) scale(1.06); }
    }

    /* ---------- App shell ---------- */
    .app {
      display: flex;
      align-items: flex-start;
      gap: 26px;
      max-width: 1360px;
      margin: 0 auto;
      padding: 26px 30px 72px;
    }
    .page-container { flex: 1 1 auto; min-width: 0; }

    /* ---------- Icon rail (tab navigation) ---------- */
    .rail {
      position: sticky;
      top: 26px;
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      border-radius: 24px;
      background: var(--glass);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
      box-shadow: var(--shadow-card);
      z-index: 60;
    }
    .rail-mark {
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border-radius: 17px;
      background: var(--ink);
      color: #F7F6F0;
      margin-bottom: 4px;
    }
    .rail-sep {
      height: 1px;
      margin: 4px 8px;
      background: var(--glass-line);
    }

    .tab-btn {
      position: relative;
      width: 52px;
      height: 52px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 17px;
      background: transparent;
      color: var(--text-3);
      cursor: pointer;
      transition: background 0.2s var(--ease), color 0.2s var(--ease),
                  box-shadow 0.25s var(--ease), transform 0.2s var(--ease);
    }
    .tab-btn svg { width: 21px; height: 21px; display: block; }
    .tab-btn:hover { background: var(--glass-strong); color: var(--text); }
    .tab-btn:active { transform: scale(0.97); }
    .tab-btn.active {
      background: #FFFFFF;
      color: #101010;
      box-shadow: 0 12px 26px -14px rgba(20, 20, 20, 0.55);
    }
    [data-theme="dark"] .tab-btn.active { background: #F2F1EC; color: #101010; }
    .tab-btn.active::before {
      content: "";
      position: absolute;
      left: -10px;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 22px;
      border-radius: 3px;
      background: var(--lime);
    }

    .tab-label {
      position: absolute;
      left: calc(100% + 14px);
      white-space: nowrap;
      padding: 6px 11px;
      border-radius: 10px;
      background: var(--ink);
      color: #F7F6F0;
      font-size: 11.5px;
      letter-spacing: 0;
      opacity: 0;
      transform: translateX(-5px);
      pointer-events: none;
      transition: opacity 0.18s var(--ease), transform 0.18s var(--ease);
      z-index: 5;
    }
    [data-theme="dark"] .tab-label { background: #F2F1EC; color: #111; }
    .tab-btn:hover .tab-label { opacity: 1; transform: translateX(0); }

    .tab-badge {
      position: absolute;
      top: -1px;
      right: -1px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      display: grid;
      place-items: center;
      border-radius: var(--r-pill);
      background: rgba(13, 13, 13, 0.78);
      color: #F7F6F0;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 2px 6px rgba(20, 20, 20, 0.18);
    }
    [data-theme="dark"] .tab-badge { background: rgba(255, 255, 255, 0.2); }
    .tab-btn.active .tab-badge { background: var(--lime); color: #14140F; }

    /* ---------- Header ---------- */
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 22px;
      flex-wrap: wrap;
      margin-bottom: 26px;
    }
    .header-main { display: flex; align-items: flex-start; gap: 16px; }
    .title-group h1 {
      font-size: clamp(34px, 4.6vw, 47px);
      font-weight: 500;
      letter-spacing: -0.045em;
      line-height: 1;
      color: var(--text);
    }
    .subtitle {
      margin-top: 11px;
      font-size: 12.5px;
      color: var(--text-2);
      letter-spacing: 0;
      max-width: 58ch;
    }
    .header-actions { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }

    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      height: 42px;
      padding: 0 17px;
      border-radius: var(--r-pill);
      background: var(--glass);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      color: var(--text-2);
      font-size: 12.5px;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 10px 26px -24px rgba(20, 20, 20, 0.7);
      transition: background 0.2s var(--ease), color 0.2s var(--ease),
                  transform 0.2s var(--ease);
    }
    .pill-btn:hover { background: var(--glass-strong); color: var(--text); transform: translateY(-1px); }
    .date-pill { cursor: default; font-variant-numeric: tabular-nums; }
    .date-pill:hover { transform: none; background: var(--glass); color: var(--text-2); }
    .theme-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: linear-gradient(140deg, var(--lime), var(--apricot));
      box-shadow: 0 0 0 3px rgba(242, 234, 46, 0.18);
    }

    /* ---------- Bento accent cards ---------- */
    .bento {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }
    .col-3  { grid-column: span 3; }
    .col-4  { grid-column: span 4; }
    .col-6  { grid-column: span 6; }
    .col-8  { grid-column: span 8; }
    .col-12 { grid-column: span 12; }

    .bento-card {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 22px;
      min-height: 206px;
      border-radius: var(--r-xl);
      border: 1px solid transparent;
      box-shadow: var(--shadow-card);
    }
    .bento-glass {
      background: var(--glass);
      border-color: var(--glass-border);
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
    }
    .bento-lime {
      background: linear-gradient(150deg, #F8F370 0%, #F0E92F 46%, #DED714 100%);
      color: #17170F;
      border-color: rgba(255, 255, 255, 0.5);
    }
    .bento-apricot {
      background: linear-gradient(152deg, #FFB080 0%, #FE9251 46%, #F4711F 100%);
      color: #2B1405;
      border-color: rgba(255, 255, 255, 0.38);
    }
    .bento-ink {
      background: #0C0C0D;
      color: #F5F4EE;
      border-color: rgba(255, 255, 255, 0.09);
    }

    [data-theme="dark"] .bento-ink {
      background: linear-gradient(158deg, #202024 0%, #131316 60%, #0C0C0E 100%);
      border-color: rgba(255, 255, 255, 0.14);
    }

    .bento-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      position: relative;
      z-index: 2;
    }
    .bento-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      opacity: 0.68;
    }
    .bento-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: var(--r-pill);
      background: rgba(255, 255, 255, 0.42);
      border: 1px solid rgba(255, 255, 255, 0.55);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .bento-ink .bento-chip {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.14);
      color: rgba(245, 244, 238, 0.78);
    }

    .metric-value {
      position: relative;
      z-index: 2;
      font-size: clamp(48px, 5.4vw, 66px);
      font-weight: 500;
      line-height: 0.92;
      letter-spacing: -0.055em;
      font-variant-numeric: tabular-nums;
      margin-top: 2px;
    }
    .metric-note {
      position: relative;
      z-index: 2;
      font-size: 11.5px;
      letter-spacing: 0;
      opacity: 0.62;
      margin-top: auto;
    }

    .bento-split {
      position: relative;
      z-index: 2;
      display: flex;
      gap: 26px;
      margin-top: 6px;
    }
    .mini-stat { display: flex; flex-direction: column; gap: 2px; }
    .mini-stat b {
      font-size: 19px;
      font-weight: 500;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .mini-stat em {
      font-size: 10.5px;
      font-style: normal;
      letter-spacing: 0.02em;
      opacity: 0.6;
    }

    .legend {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: 4px;
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      letter-spacing: 0;
      opacity: 0.9;
    }
    .legend-row b {
      margin-left: auto;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex: 0 0 auto;
      background: rgba(20, 12, 4, 0.55);
    }
    .dot-line {
      background: transparent;
      border: 1.5px solid rgba(20, 12, 4, 0.5);
    }
    .dot-lime { background: var(--lime); }
    .dot-apricot { background: var(--apricot); }

    .ink-pill {
      position: relative;
      z-index: 2;
      align-self: flex-start;
      margin-top: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--r-pill);
      background: #0C0C0D;
      color: #F7F6F0;
      font-size: 11px;
      letter-spacing: 0.01em;
    }

    /* decorative textures */
    .bento-deco {
      position: absolute;
      right: -6%;
      bottom: -12%;
      width: 54%;
      height: 68%;
      pointer-events: none;
      z-index: 1;
    }
    .bento-lime .bento-deco {
      background-image: radial-gradient(circle at center, rgba(20, 18, 6, 0.42) 1.1px, transparent 1.2px);
      background-size: 9px 9px;
      -webkit-mask-image: linear-gradient(205deg, #000 6%, transparent 76%);
      mask-image: linear-gradient(205deg, #000 6%, transparent 76%);
    }
    .bento-lime .bento-deco::after {
      content: "";
      position: absolute;
      inset: 44% 0 0 34%;
      background-image: repeating-linear-gradient(45deg, rgba(20, 18, 6, 0.3) 0 1.5px, transparent 1.5px 7px);
      -webkit-mask-image: linear-gradient(200deg, #000, transparent 80%);
      mask-image: linear-gradient(200deg, #000, transparent 80%);
    }
    .bento-apricot .bento-deco {
      width: 62%;
      height: 82%;
      background-image: repeating-radial-gradient(circle at 108% 108%,
        rgba(40, 14, 0, 0.16) 0 2px, transparent 2px 13px);
    }
    .bento-ink .bento-deco {
      background-image: radial-gradient(circle at center, rgba(255, 255, 255, 0.13) 1px, transparent 1.1px);
      background-size: 12px 12px;
      -webkit-mask-image: linear-gradient(205deg, #000 4%, transparent 72%);
      mask-image: linear-gradient(205deg, #000 4%, transparent 72%);
    }

    /* ---------- Spotlight (top pick) ---------- */
    .spotlight-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      position: relative;
      z-index: 2;
    }
    .circle-btn {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #F5F4EE;
      transition: background 0.2s var(--ease), transform 0.2s var(--ease);
    }
    .circle-btn:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-1px); }
    .spotlight-body {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 4px;
    }
    .spotlight-meta { display: flex; flex-direction: column; min-width: 0; }
    .spotlight-score {
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-size: 50px;
      font-weight: 500;
      line-height: 0.95;
      letter-spacing: -0.05em;
      font-variant-numeric: tabular-nums;
    }
    .spotlight-score span { font-size: 13px; font-weight: 400; letter-spacing: 0; opacity: 0.45; }
    .spotlight-company {
      margin-top: 8px;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(245, 244, 238, 0.55);
    }
    .spotlight-title {
      font-size: 17px;
      font-weight: 500;
      line-height: 1.32;
      letter-spacing: -0.02em;
      color: #F7F6F0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .spotlight-title:hover { color: var(--lime); }
    .spotlight-foot {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: auto;
      padding-top: 6px;
    }
    .spotlight-loc {
      min-width: 0;
      flex: 1;
      font-size: 11px;
      color: rgba(245, 244, 238, 0.62);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .square-cta {
      flex: 0 0 auto;
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 15px;
      background: var(--lime);
      color: #14140F;
      box-shadow: 0 12px 26px -14px rgba(242, 234, 46, 0.9);
      transition: transform 0.22s var(--ease), box-shadow 0.22s var(--ease);
    }
    .square-cta:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 18px 34px -14px rgba(242, 234, 46, 0.95); }
    .spotlight-empty { font-size: 12.5px; color: rgba(245, 244, 238, 0.55); margin-top: 6px; }

    /* ---------- Activity chart ---------- */
    .activity-chart {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: flex-end;
      gap: 6px;
      height: 108px;
      margin-top: auto;
      padding-top: 8px;
      border-bottom: 1px solid var(--glass-line);
    }
    .bar-col {
      flex: 1 1 0;
      min-width: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 6px;
    }
    .bar-stack {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: 100%;
      border-radius: 7px;
      background: rgba(20, 20, 20, 0.04);
      overflow: hidden;
      transition: background 0.2s var(--ease), transform 0.2s var(--ease);
    }
    .bar-col:hover .bar-stack { background: rgba(20, 20, 20, 0.075); transform: translateY(-2px); }
    .bar-stack i { display: block; width: 100%; transition: height 0.6s var(--ease); }
    .bar-veto { background: linear-gradient(180deg, var(--apricot), var(--apricot-deep)); }
    .bar-match { background: linear-gradient(180deg, var(--lime-soft), var(--lime-deep)); }
    .bar-x {
      font-size: 9px;
      letter-spacing: 0.04em;
      color: var(--text-3);
      text-align: center;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      margin-bottom: 2px;
    }
    .chart-legend {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-top: 14px;
      font-size: 11.5px;
      color: var(--text-2);
      letter-spacing: 0;
    }
    .chart-legend span { display: inline-flex; align-items: center; gap: 7px; }
    .chart-legend b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }

    /* ---------- Signal ring ---------- */
    .ring-wrap {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 18px;
      margin-top: 2px;
    }
    .ring { width: 104px; height: 104px; flex: 0 0 auto; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 9; stroke-linecap: round; }
    .ring .track { stroke: rgba(20, 20, 20, 0.08); }
    .ring .val { stroke: var(--apricot); transition: stroke-dashoffset 0.9s var(--ease); }
    [data-theme="dark"] .ring .track { stroke: rgba(255, 255, 255, 0.1); }
    .ring-meta { min-width: 0; }
    .ring-meta b {
      display: block;
      font-size: 30px;
      font-weight: 500;
      letter-spacing: -0.04em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .ring-meta em {
      display: block;
      margin-top: 5px;
      font-style: normal;
      font-size: 11px;
      color: var(--text-3);
      letter-spacing: 0.02em;
    }
    .span-line {
      position: relative;
      z-index: 2;
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--glass-line);
      font-size: 12px;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
    }
    .span-line b { color: var(--text); font-weight: 500; }

    /* ---------- Filter bar ---------- */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 10px;
      margin: 4px 0 18px;
      border-radius: var(--r-pill);
      background: var(--glass);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
      box-shadow: 0 14px 40px -34px rgba(20, 20, 20, 0.7);
    }
    .search-box {
      flex: 1 1 260px;
      min-width: 200px;
      display: flex;
      align-items: center;
      gap: 9px;
      height: 42px;
      padding: 0 16px;
      border-radius: var(--r-pill);
      background: rgba(255, 255, 255, 0.55);
      border: 1px solid transparent;
      color: var(--text-3);
      transition: border-color 0.2s var(--ease), box-shadow 0.2s var(--ease),
                  background 0.2s var(--ease);
    }
    .search-box:focus-within {
      background: rgba(255, 255, 255, 0.8);
      border-color: rgba(20, 20, 20, 0.12);
      box-shadow: 0 0 0 3px rgba(242, 234, 46, 0.32);
    }
    [data-theme="dark"] .search-box,
    [data-theme="dark"] .select-filter { background-color: rgba(255, 255, 255, 0.07); color: var(--text); }
    [data-theme="dark"] .search-box { background: rgba(255, 255, 255, 0.07); }
    [data-theme="dark"] .search-box:focus-within { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.24); }
    [data-theme="dark"] .select-filter:hover { background-color: rgba(255, 255, 255, 0.12); }
    [data-theme="dark"] .btn-primary { background: #F2F1EC; color: #121210 !important; }
    [data-theme="dark"] .btn-primary:hover { background: var(--lime); color: #121210 !important; }
    [data-theme="dark"] .bar-stack { background: rgba(255, 255, 255, 0.07); }
    [data-theme="dark"] .bar-col:hover .bar-stack { background: rgba(255, 255, 255, 0.12); }
    .search-input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      font-family: var(--sans);
      font-size: 13px;
      letter-spacing: 0;
      color: var(--text);
    }
    .search-input::placeholder { color: var(--text-3); }
    .search-icon { flex: 0 0 auto; }

    .select-filter {
      height: 42px;
      padding: 0 34px 0 16px;
      border-radius: var(--r-pill);
      background-color: rgba(255, 255, 255, 0.5);
      border: 1px solid transparent;
      color: var(--text-2);
      font-family: var(--sans);
      font-size: 12.5px;
      letter-spacing: 0;
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
      outline: none;
      background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B8A83' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      transition: background-color 0.2s var(--ease), color 0.2s var(--ease);
    }
    .select-filter:hover { background-color: rgba(255, 255, 255, 0.75); color: var(--text); }

    .results-count {
      margin-left: auto;
      padding: 0 6px;
      font-size: 11.5px;
      color: var(--text-3);
      letter-spacing: 0;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .reset-btn {
      flex: 0 0 auto;
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: var(--lime);
      color: #14140F;
      cursor: pointer;
      box-shadow: 0 10px 22px -14px rgba(200, 190, 20, 0.9);
      transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
    }
    .reset-btn:hover { transform: rotate(-40deg); box-shadow: 0 14px 26px -14px rgba(200, 190, 20, 0.95); }

    /* ---------- Views ---------- */
    .tab-view { display: none; }
    .tab-view.active { display: block; animation: viewIn 0.35s var(--ease); }
    @keyframes viewIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: none; }
    }

    /* ---------- Match cards ---------- */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 16px;
      margin-bottom: 0;
    }
    .kami-card {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22px;
      border-radius: var(--r-lg);
      background: var(--glass);
      border: 1px solid var(--glass-border);
      backdrop-filter: blur(20px) saturate(150%);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
      box-shadow: 0 20px 50px -40px rgba(24, 22, 18, 0.75);
      transition: transform 0.28s var(--ease), box-shadow 0.28s var(--ease),
                  border-color 0.28s var(--ease), background 0.28s var(--ease);
    }
    .kami-card:hover {
      transform: translateY(-3px);
      background: var(--glass-strong);
      border-color: #FFFFFF;
      box-shadow: 0 30px 64px -40px rgba(24, 22, 18, 0.7);
    }
    [data-theme="dark"] .kami-card:hover { border-color: rgba(255, 255, 255, 0.22); }

    .score-watermark {
      position: absolute;
      top: -34px;
      right: 12px;
      font-size: 96px;
      font-weight: 500;
      line-height: 1;
      letter-spacing: -0.07em;
      color: rgba(20, 20, 19, 0.03);
      pointer-events: none;
      user-select: none;
      font-variant-numeric: tabular-nums;
    }
    [data-theme="dark"] .score-watermark { color: rgba(255, 255, 255, 0.04); }

    .card-body { position: relative; z-index: 1; }
    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 12px;
    }
    .company-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      color: var(--text-3);
    }
    .job-title {
      margin-top: 5px;
      font-size: 18px;
      font-weight: 500;
      line-height: 1.3;
      letter-spacing: -0.022em;
    }
    .job-title a { color: var(--text); }
    .job-title a:hover { color: var(--apricot-deep); }

    .score-container {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }
    .score-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: var(--r-pill);
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.01em;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .score-high { background: var(--apricot); color: #2B1405; }
    .score-good { background: rgba(30, 130, 194, 0.14); color: #14608F; border: 1px solid rgba(30, 130, 194, 0.24); }
    .score-mid  { background: rgba(20, 20, 20, 0.08); color: var(--text); }
    [data-theme="dark"] .score-good { color: #7CC0EA; background: rgba(30, 130, 194, 0.2); }
    [data-theme="dark"] .score-mid { background: rgba(255, 255, 255, 0.1); color: var(--text-2); }

    .date-label {
      font-size: 10.5px;
      color: var(--text-3);
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
    }

    .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 14px;
    }
    .kami-tag {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 4px 10px;
      border-radius: var(--r-pill);
      background: rgba(20, 20, 19, 0.055);
      border: 1px solid transparent;
      color: var(--text-2);
      font-size: 11px;
      letter-spacing: 0;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      transition: background 0.18s var(--ease), color 0.18s var(--ease);
    }
    .kami-tag:hover { background: rgba(242, 234, 46, 0.45); color: #17170F; }
    .salary-tag {
      background: rgba(30, 130, 194, 0.12);
      color: #14608F;
      cursor: default;
    }
    .salary-tag:hover { background: rgba(30, 130, 194, 0.12); color: #14608F; }
    .source-tag { background: rgba(255, 255, 255, 0.55); color: var(--text-3); cursor: default; }
    .source-tag:hover { background: rgba(255, 255, 255, 0.55); color: var(--text-3); }
    [data-theme="dark"] .kami-tag { background: rgba(255, 255, 255, 0.08); }
    [data-theme="dark"] .salary-tag { background: rgba(30, 130, 194, 0.22); color: #8FC7EA; }
    [data-theme="dark"] .source-tag { background: rgba(255, 255, 255, 0.1); }

    /* callout blocks */
    .callout-box {
      position: relative;
      padding: 12px 14px 13px;
      border-radius: var(--r-md);
      margin-bottom: 10px;
      background: rgba(255, 255, 255, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.7);
    }
    .why-box {
      background: linear-gradient(170deg, rgba(242, 234, 46, 0.2), rgba(242, 234, 46, 0.05));
      border-color: rgba(226, 214, 40, 0.5);
    }
    .tips-box { background: rgba(20, 20, 19, 0.035); border-color: rgba(20, 20, 19, 0.05); }
    [data-theme="dark"] .callout-box { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.08); }
    [data-theme="dark"] .why-box { background: linear-gradient(170deg, rgba(242, 234, 46, 0.12), rgba(242, 234, 46, 0.03)); border-color: rgba(242, 234, 46, 0.22); }
    [data-theme="dark"] .tips-box { background: rgba(255, 255, 255, 0.04); }

    .callout-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.11em;
      color: var(--text-2);
      margin-bottom: 5px;
    }
    .callout-bullet { color: var(--apricot-deep); font-size: 12px; }
    .callout-text {
      font-size: 13px;
      line-height: 1.55;
      color: var(--text-2);
      letter-spacing: 0;
    }
    .callout-text strong { font-weight: 600; color: var(--text); }
    .callout-text code {
      font-family: var(--mono);
      font-size: 11.5px;
      padding: 1px 5px;
      border-radius: 5px;
      background: rgba(20, 20, 19, 0.06);
      color: var(--text);
    }
    [data-theme="dark"] .callout-text code { background: rgba(255, 255, 255, 0.1); }
    .callout-text.is-clamped {
      display: -webkit-box;
      -webkit-line-clamp: 6;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .callout-box.expanded .callout-text.is-clamped {
      display: block;
      -webkit-line-clamp: unset;
      overflow: visible;
    }
    .more-btn {
      margin-top: 7px;
      border: 0;
      padding: 0;
      background: transparent;
      color: var(--text-3);
      font-size: 11px;
      letter-spacing: 0.02em;
      cursor: pointer;
      border-bottom: 1px solid rgba(20, 20, 19, 0.18);
      transition: color 0.18s var(--ease), border-color 0.18s var(--ease);
    }
    .more-btn:hover { color: var(--text); border-bottom-color: currentColor; }

    /* card footer */
    .card-footer {
      position: relative;
      z-index: 1;
      margin-top: 12px;
      padding-top: 13px;
      border-top: 1px solid var(--glass-line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
    }
    .card-footer > div { min-width: 0; flex: 1 1 auto; overflow: hidden; }
    .path-label {
      font-family: var(--mono);
      font-size: 10.5px;
      color: var(--text-3);
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .eval-chip {
      margin-top: 4px;
      font-size: 10.5px;
      color: var(--text-3);
      letter-spacing: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-primary {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 9px 16px;
      border-radius: var(--r-pill);
      background: var(--ink);
      color: #F7F6F0 !important;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.01em;
      white-space: nowrap;
      transition: background 0.2s var(--ease), transform 0.2s var(--ease);
    }
    .btn-primary:hover { background: var(--apricot); color: #23120A !important; transform: translateY(-1px); }
    .btn-primary .arrow { font-size: 13px; transition: transform 0.2s var(--ease); }
    .btn-primary:hover .arrow { transform: translate(2px, -2px); }

    .repeat-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 8px;
      border-radius: var(--r-pill);
      background: rgba(20, 20, 19, 0.055);
      color: var(--text-2);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    [data-theme="dark"] .repeat-badge { background: rgba(255, 255, 255, 0.09); }

    /* evaluation run grouping */
    .date-section { margin-bottom: 34px; }
    .date-section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 11px;
      margin-bottom: 15px;
      border-bottom: 1px solid var(--glass-line);
    }
    .date-heading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
      color: var(--text);
    }
    .date-heading::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--lime);
      box-shadow: 0 0 0 3px rgba(242, 234, 46, 0.25);
    }
    .date-hint {
      min-width: 0;
      max-width: 46%;
      font-family: var(--mono);
      font-size: 10.5px;
      color: var(--text-3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .date-count {
      margin-left: auto;
      padding: 3px 9px;
      border-radius: var(--r-pill);
      background: var(--glass-strong);
      border: 1px solid var(--glass-border);
      font-size: 10.5px;
      color: var(--text-2);
      letter-spacing: 0.02em;
      white-space: nowrap;
    }

    /* ---------- Panels (history / audit) ---------- */
    .audit-section {
      padding: 22px;
      margin-bottom: 28px;
      border-radius: var(--r-xl);
      background: var(--panel);
      border: 1px solid var(--glass-border);
      box-shadow: var(--shadow-card);
    }
    .audit-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }
    .audit-title {
      font-size: 16px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .breaking-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: var(--r-pill);
      background: rgba(254, 146, 81, 0.18);
      color: #8E4112;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    [data-theme="dark"] .breaking-badge { color: #F5A26D; background: rgba(254, 146, 81, 0.16); }
    .breaking-badge.ok { background: rgba(242, 234, 46, 0.4); color: #4A470A; }
    [data-theme="dark"] .breaking-badge.ok { background: rgba(242, 234, 46, 0.16); color: #E8E27A; }

    /* audit table */
    .audit-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 12.5px;
      letter-spacing: 0;
    }
    .audit-th {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 10px 14px;
      text-align: left;
      background: var(--panel);
      border-bottom: 1px solid var(--glass-line);
      color: var(--text-3);
      font-weight: 500;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      white-space: nowrap;
    }
    .audit-th:first-child { border-radius: var(--r-sm) 0 0 0; width: 30%; }
    .audit-th:nth-child(2) { width: 18%; }
    .audit-th:last-child { border-radius: 0 var(--r-sm) 0 0; }
    .audit-td {
      padding: 11px 14px;
      border-bottom: 1px solid var(--glass-line);
      color: var(--text-2);
      vertical-align: middle;
    }
    .audit-td:first-child { color: var(--text); font-weight: 500; letter-spacing: -0.01em; }
    .audit-row { transition: background 0.18s var(--ease); }
    .audit-row:hover { background: rgba(255, 255, 255, 0.5); }
    [data-theme="dark"] .audit-row:hover { background: rgba(255, 255, 255, 0.05); }
    .audit-reason {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9px;
      background: rgba(254, 146, 81, 0.13);
      color: #8E4112;
      font-size: 11.5px;
      line-height: 1.55;
      letter-spacing: 0;
      white-space: normal;
    }
    [data-theme="dark"] .audit-reason { background: rgba(254, 146, 81, 0.14); color: #F0A471; }

    /* ---------- Crawled knowledge base table ---------- */
    .table-panel {
      border-radius: var(--r-lg);
      background: var(--panel);
      border: 1px solid var(--glass-border);
      box-shadow: var(--shadow-card);
      overflow: hidden;
    }
    .table-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1.7fr) minmax(0, 0.85fr) 118px 78px minmax(0, 0.9fr) 34px;
      align-items: center;
      gap: 16px;
      padding: 11px 18px;
      border-top: 1px solid var(--glass-line);
      transition: background 0.18s var(--ease);
      content-visibility: auto;
      contain-intrinsic-size: 70px;
    }
    .table-row:first-child { border-top: 0; }
    .table-row:hover { background: rgba(255, 255, 255, 0.55); }
    [data-theme="dark"] .table-row:hover { background: rgba(255, 255, 255, 0.05); }
    .table-row.head {
      padding-top: 14px;
      padding-bottom: 12px;
      background: transparent;
      border-top: 0;
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      color: var(--text-3);
      content-visibility: visible;
    }
    .table-row.head:hover { background: transparent; }
    .thumb {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 13px;
      background: linear-gradient(150deg, var(--ink-3), #08080A);
      color: #F5F4EE;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.02em;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 8px 18px -14px rgba(0, 0, 0, 0.9);
    }
    .cell-title {
      min-width: 0;
      font-size: 13.5px;
      font-weight: 500;
      letter-spacing: -0.015em;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cell-title:hover { color: var(--apricot-deep); }
    .cell-sub {
      margin-top: 2px;
      font-family: var(--mono);
      font-size: 9.5px;
      color: var(--text-3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cell-muted {
      min-width: 0;
      font-size: 12px;
      color: var(--text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0;
    }
    .cell-tags { display: flex; gap: 5px; min-width: 0; overflow: hidden; }
    .cell-tags .kami-tag { font-size: 10px; padding: 3px 8px; max-width: 118px; }
    .row-btn {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgba(20, 20, 19, 0.05);
      color: var(--text-2);
      transition: background 0.18s var(--ease), color 0.18s var(--ease),
                  transform 0.18s var(--ease);
    }
    .row-btn:hover { background: var(--ink); color: #F7F6F0; transform: translate(1px, -1px); }
    [data-theme="dark"] .row-btn { background: rgba(255, 255, 255, 0.08); }

    /* ---------- History timeline ---------- */
    .history-list { display: flex; flex-direction: column; gap: 4px; }
    .history-row {
      display: grid;
      grid-template-columns: 100px minmax(0, 1.25fr) minmax(120px, 300px) 158px;
      align-items: center;
      gap: 18px;
      padding: 12px 14px;
      border-radius: var(--r-sm);
      font-size: 12.5px;
      letter-spacing: 0;
      color: var(--text-2);
      transition: background 0.18s var(--ease);
    }
    .history-row:hover { background: rgba(255, 255, 255, 0.5); }
    [data-theme="dark"] .history-row:hover { background: rgba(255, 255, 255, 0.05); }
    .history-date {
      font-weight: 600;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    .history-file {
      font-family: var(--mono);
      font-size: 10.5px;
      color: var(--text-3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .history-bar {
      display: flex;
      height: 6px;
      border-radius: var(--r-pill);
      background: rgba(20, 20, 19, 0.07);
      overflow: hidden;
      gap: 1px;
    }
    [data-theme="dark"] .history-bar { background: rgba(255, 255, 255, 0.1); }
    .history-bar i { display: block; height: 100%; }
    .history-bar .hb-match { background: var(--lime); }
    .history-bar .hb-veto { background: var(--apricot); }
    .history-counts { display: flex; gap: 6px; justify-content: flex-end; }
    .history-row .breaking-badge { font-size: 10px; padding: 3px 9px; }

    /* ---------- Empty state ---------- */
    .empty-state {
      padding: 54px 24px;
      border-radius: var(--r-xl);
      border: 1px dashed var(--glass-border);
      background: var(--glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      text-align: center;
      color: var(--text-3);
      font-size: 13px;
      letter-spacing: 0;
    }
    .empty-icon { font-size: 26px; margin-bottom: 10px; opacity: 0.75; }

    /* ---------- Footer ---------- */
    footer {
      margin-top: 46px;
      padding-top: 20px;
      border-top: 1px solid var(--glass-line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--text-3);
      letter-spacing: 0.01em;
    }
    footer .foot-links { display: flex; gap: 14px; align-items: center; }
    footer a { color: var(--text-2); border-bottom: 1px solid transparent; }
    footer a:hover { color: var(--text); border-bottom-color: currentColor; }

    /* ---------- Responsive ---------- */
    @media (max-width: 1180px) {
      .col-4 { grid-column: span 6; }
      .col-8 { grid-column: span 12; }
      .col-3 { grid-column: span 6; }
      .bento-ink { grid-column: span 12; }
      .signal-card {
        grid-column: span 12;
        flex-direction: row;
        align-items: center;
        flex-wrap: wrap;
        gap: 26px;
      }
      .signal-card .bento-head { width: 100%; }
      .signal-card .ring-wrap { margin-top: 0; }
      .signal-card .span-line {
        margin-top: 0;
        padding-top: 0;
        padding-left: 26px;
        border-top: 0;
        border-left: 1px solid var(--glass-line);
      }
      .bento-ink .spotlight-body {
        flex-direction: row;
        align-items: center;
        gap: 30px;
        flex-wrap: wrap;
      }
      .bento-ink .spotlight-score { font-size: 64px; }
      .bento-ink .spotlight-company { margin-top: 0; }
      .bento-ink .spotlight-title { font-size: 20px; max-width: 44ch; }
    }
    @media (max-width: 1000px) {
      .app { flex-direction: column; gap: 16px; padding: 18px 18px 56px; }
      .rail {
        position: sticky;
        top: 12px;
        flex-direction: row;
        width: 100%;
        gap: 4px;
        padding: 7px;
        border-radius: 20px;
        align-items: center;
      }
      .rail-mark { width: 40px; height: 40px; border-radius: 13px; margin: 0 4px 0 0; }
      .rail-mark svg { width: 20px; height: 20px; }
      .rail-sep { width: 1px; height: 24px; margin: 0 4px; }
      .tab-btn {
        width: auto;
        height: 40px;
        flex: 1 1 auto;
        display: flex;
        gap: 7px;
        padding: 0 10px;
        border-radius: 14px;
      }
      .tab-btn svg { width: 17px; height: 17px; }
      .tab-btn.active::before { display: none; }
      .tab-label {
        position: static;
        opacity: 1;
        transform: none;
        background: transparent;
        color: inherit;
        padding: 0;
        font-size: 11.5px;
        font-weight: 500;
      }
      [data-theme="dark"] .tab-label { background: transparent; color: inherit; }
      .tab-badge {
        position: static;
        margin-left: auto;
        background: rgba(20, 20, 19, 0.08);
        color: var(--text-2);
        height: 16px;
      }
      [data-theme="dark"] .tab-badge { background: rgba(255, 255, 255, 0.12); }
      .tab-btn.active .tab-badge { background: var(--ink); color: #F7F6F0; }
      header { margin-bottom: 20px; }
      .col-4, .col-3, .col-6 { grid-column: span 6; }
      .cards-grid { grid-template-columns: 1fr; }
      .table-row {
        grid-template-columns: 40px minmax(0, 1fr) 34px;
        gap: 12px;
        padding: 11px 14px;
      }
      .table-row > .cell-hide { display: none; }
      .table-row.head { display: none; }
      .history-row { grid-template-columns: 84px minmax(0, 1fr) 120px; gap: 12px; }
      .history-row .history-file { display: none; }
      .history-row .history-bar { display: none; }
      .bar-x { display: none; }
      .activity-chart { height: 92px; }
    }
    @media (max-width: 700px) {
      .app { padding: 14px 14px 48px; }
      .bento { gap: 12px; }
      .col-4, .col-3, .col-6, .col-8, .col-12 { grid-column: span 12; }
      .bento-card { min-height: 178px; padding: 19px; }
      .metric-value { font-size: 50px; }
      .signal-card { flex-direction: column; align-items: stretch; gap: 10px; }
      .signal-card .span-line {
        margin-top: auto;
        padding-top: 14px;
        padding-left: 0;
        border-top: 1px solid var(--glass-line);
        border-left: 0;
      }
      .rail-mark, .rail-sep { display: none; }
      .rail { overflow-x: auto; scrollbar-width: none; }
      .rail::-webkit-scrollbar { display: none; }
      .tab-btn { gap: 6px; padding: 0 8px; justify-content: center; }
      .tab-label { display: inline; font-size: 11px; }
      .tab-btn .tab-badge {
        position: static;
        margin-left: 2px;
        height: 15px;
        min-width: 15px;
        font-size: 8.5px;
        background: rgba(20, 20, 19, 0.1);
        color: var(--text-2);
        box-shadow: none;
      }
      .tab-btn.active .tab-badge { background: var(--ink); color: #F7F6F0; }
      .date-hint { max-width: 34%; }
      .audit-section { padding: 16px; }
      .audit-table { font-size: 11.5px; }
      .audit-td, .audit-th { padding: 9px 8px; }
      .filter-bar { border-radius: 22px; }
      .results-count { margin-left: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .bento-glass, .kami-card, .audit-section, .table-panel, .filter-bar, .rail,
      .pill-btn, .empty-state { background: rgba(252, 251, 248, 0.94); }
      [data-theme="dark"] .bento-glass,
      [data-theme="dark"] .kami-card,
      [data-theme="dark"] .audit-section,
      [data-theme="dark"] .table-panel,
      [data-theme="dark"] .filter-bar,
      [data-theme="dark"] .rail,
      [data-theme="dark"] .pill-btn { background: #1A1A1E; }
    }
  </style>

  <!-- External or local data loader -->
  <script src="data.js"></script>
</head>
<body>
  <div class="app">

    <!-- Icon rail navigation -->
    <nav class="rail" aria-label="Dashboard sections">
      <div class="rail-mark" title="JD Matcher">
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="5" y="4" width="16" height="22" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M9.5 10.5H15.5M9.5 15.5H17M9.5 20.5H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="21.5" cy="20.5" r="5.5" fill="#0D0D0D" stroke="currentColor" stroke-width="2"/>
          <path d="M19.3 20.5L20.8 22L23.8 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="rail-sep" aria-hidden="true"></div>

      <button class="tab-btn active" data-tab="matches" aria-label="Matched recommendations">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.2"></circle>
          <circle cx="12" cy="12" r="3.4"></circle>
          <path d="M12 1.8v3.2M12 19v3.2M1.8 12h3.2M19 12h3.2"></path>
        </svg>
        <span class="tab-label">Matches</span>
        <span id="badgeMatched" class="tab-badge">0</span>
      </button>

      <button class="tab-btn" data-tab="crawled" aria-label="All crawled jobs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3.2 21 8l-9 4.8L3 8l9-4.8Z"></path>
          <path d="M3 12.4l9 4.8 9-4.8"></path>
          <path d="M3 16.8l9 4.8 9-4.8"></path>
        </svg>
        <span class="tab-label">Crawled</span>
        <span id="badgeCrawled" class="tab-badge">0</span>
      </button>

      <button class="tab-btn" data-tab="history" aria-label="Evaluation history">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3.2 12a8.8 8.8 0 1 0 2.9-6.5"></path>
          <path d="M3 3.4v4.3h4.3"></path>
          <path d="M12 7.6V12l3 1.9"></path>
        </svg>
        <span class="tab-label">History</span>
        <span id="badgeHistory" class="tab-badge">0</span>
      </button>

      <button class="tab-btn" data-tab="audit" aria-label="Excluded audit log">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2.8 4.6 6v6c0 4.6 3.1 7.9 7.4 9.3 4.3-1.4 7.4-4.7 7.4-9.3V6L12 2.8Z"></path>
          <path d="M9.4 9.6l5.2 5.2M14.6 9.6l-5.2 5.2"></path>
        </svg>
        <span class="tab-label">Vetoed</span>
        <span id="badgeAudit" class="tab-badge">0</span>
      </button>
    </nav>

    <div class="page-container">

      <!-- Header -->
      <header>
        <div class="header-main">
          <div class="title-group">
            <h1>JD Matcher</h1>
            <div class="subtitle">AI-powered JD &amp; resume match engine · curated remote opportunities</div>
          </div>
        </div>
        <div class="header-actions">
          <span id="datePill" class="pill-btn date-pill">Updated: ${updatedAt}</span>
          <button id="themeToggle" class="pill-btn" title="Toggle frost / ink theme">
            <span class="theme-dot" aria-hidden="true"></span>
            <span id="themeLabel">Frost</span>
          </button>
        </div>
      </header>

      <!-- Bento: accent stats + spotlight -->
      <section class="bento" aria-label="Key metrics">
        <div class="bento-card bento-lime col-4">
          <div class="bento-head">
            <span class="bento-label">Recommended</span>
            <span class="bento-chip">score ≥ 6.0</span>
          </div>
          <div id="statMatched" class="metric-value">0</div>
          <div class="bento-split">
            <div class="mini-stat">
              <b id="statTop">0</b>
              <em>top ≥ 8.5</em>
            </div>
            <div class="mini-stat">
              <b id="statAvg">—</b>
              <em>avg score</em>
            </div>
          </div>
          <div class="bento-deco" aria-hidden="true"></div>
          <span class="ink-pill">approved by agent</span>
        </div>

        <div class="bento-card bento-apricot col-4">
          <div class="bento-head">
            <span class="bento-label">Knowledge base</span>
            <span class="bento-chip">crawled JDs</span>
          </div>
          <div id="statCrawled" class="metric-value">0</div>
          <div class="legend">
            <div class="legend-row"><span class="dot"></span>Reports aggregated<b id="statReports">0</b></div>
            <div class="legend-row"><span class="dot dot-line"></span>Hard vetoed<b id="statVetoed">0</b></div>
          </div>
          <div class="metric-note">Markdown JDs indexed in data/jds</div>
          <div class="bento-deco" aria-hidden="true"></div>
        </div>

        <div id="spotlightCard" class="bento-card bento-ink col-4"></div>

        <div class="bento-card bento-glass col-8">
          <div class="bento-head">
            <span class="bento-label">Evaluation activity</span>
            <span class="bento-chip">matched vs vetoed per run</span>
          </div>
          <div id="activityChart" class="activity-chart" role="img" aria-label="Matched and vetoed counts per evaluation run"></div>
          <div class="chart-legend">
            <span><i class="dot dot-lime"></i> Matched <b id="chartMatched">0</b></span>
            <span><i class="dot dot-apricot"></i> Vetoed <b id="chartVetoed">0</b></span>
          </div>
        </div>

        <div class="bento-card bento-glass col-4 signal-card">
          <div class="bento-head">
            <span class="bento-label">Signal</span>
            <span class="bento-chip">conviction</span>
          </div>
          <div class="ring-wrap">
            <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="52"></circle>
              <circle class="val" id="ringVal" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7"></circle>
            </svg>
            <div class="ring-meta">
              <b id="statShare">—</b>
              <em>top-conviction share</em>
            </div>
          </div>
          <div class="span-line">History <b id="statSpan">—</b></div>
        </div>
      </section>

      <!-- Filter bar -->
      <div class="filter-bar">
        <label class="search-box">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.6-3.6"></path>
          </svg>
          <input type="text" id="searchInput" class="search-input" placeholder="Search title, company, skills…" autocomplete="off">
        </label>
        <select id="scoreFilter" class="select-filter">
          <option value="0">All scores (≥ 6.0)</option>
          <option value="9">Top match (≥ 9.0)</option>
          <option value="8">Good fit (≥ 8.0)</option>
          <option value="7">Above 7.0</option>
        </select>
        <select id="sourceFilter" class="select-filter" style="display: none;">
          <option value="all">All sources</option>
          <option value="remoteok">RemoteOK</option>
          <option value="weworkremotely">WeWorkRemotely</option>
        </select>
        <span id="resultsCount" class="results-count">0 items</span>
        <button id="resetFilters" class="reset-btn" title="Reset filters" aria-label="Reset filters">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.6-6.4"></path>
            <path d="M3 3.6v4.8h4.8"></path>
          </svg>
        </button>
      </div>

      <!-- Tab View 1: Matched Recommendations (grouped by evaluation date) -->
      <section id="matchesView" class="tab-view active">
        <div id="matchesGrid"></div>
      </section>

      <!-- Tab View 2: All Crawled Jobs in Knowledge Base -->
      <section id="crawledView" class="tab-view">
        <div id="crawledGrid" class="table-panel"></div>
      </section>

      <!-- Tab View 3: Evaluation History (report timeline) -->
      <section id="historyView" class="tab-view">
        <div class="audit-section">
          <div class="audit-header">
            <h2 class="audit-title">Match report timeline</h2>
            <span id="historyCountBadge" class="breaking-badge ok">0 reports</span>
          </div>
          <div id="historyList" class="history-list"></div>
        </div>
      </section>

      <!-- Tab View 4: Veto Audit Log -->
      <section id="auditView" class="tab-view">
        <div class="audit-section">
          <div class="audit-header">
            <h2 class="audit-title">Hard constraint exclusions</h2>
            <span id="auditCountBadge" class="breaking-badge">0 JDs vetoed</span>
          </div>
          <table class="audit-table">
            <thead>
              <tr>
                <th class="audit-th">Role title</th>
                <th class="audit-th">Company</th>
                <th class="audit-th">Reason for exclusion</th>
              </tr>
            </thead>
            <tbody id="auditTableBody"></tbody>
          </table>
        </div>
      </section>

      <!-- Footer -->
      <footer>
        <span>JD Matcher · local-first job intelligence</span>
        <span class="foot-links">
          <span id="footGenerated">Frosted Workbench</span>
          <a href="https://github.com/tw93/kami" target="_blank" rel="noopener noreferrer">Kami</a>
        </span>
      </footer>

    </div>
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
      const statAvg = document.getElementById('statAvg');
      const statCrawled = document.getElementById('statCrawled');
      const statVetoed = document.getElementById('statVetoed');
      const statReports = document.getElementById('statReports');
      const statSpan = document.getElementById('statSpan');
      const statShare = document.getElementById('statShare');
      const ringVal = document.getElementById('ringVal');
      const datePill = document.getElementById('datePill');

      const spotlightCard = document.getElementById('spotlightCard');
      const activityChart = document.getElementById('activityChart');
      const chartMatched = document.getElementById('chartMatched');
      const chartVetoed = document.getElementById('chartVetoed');

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
          .replace(/&#(\\d+);/g, (m, n) => {
            const code = parseInt(n, 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
          })
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      // Escape + light markdown (bold and inline code) for the analysis callouts
      function formatRich(str) {
        return escapeHtml(str)
          .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      }

      function callout(kind, label, bullet, text) {
        const raw = text || '';
        const long = raw.length > 320;
        return \`
          <div class="callout-box \${kind}">
            <div class="callout-title"><span class="callout-bullet">\${bullet}</span> \${label}</div>
            <p class="callout-text\${long ? ' is-clamped' : ''}">\${formatRich(raw)}</p>
            \${long ? '<button type="button" class="more-btn">Read more</button>' : ''}
          </div>
        \`;
      }

      // Render KPI Metrics
      function updateStats() {
        const matches = db.matches || [];
        const rejections = db.rejections || [];
        const reports = db.reports || [];
        const crawled = db.crawledJds || [];
        const topCount = matches.filter(m => m.matchScore >= 8.5).length;
        const avg = matches.length
          ? (matches.reduce((acc, m) => acc + (Number(m.matchScore) || 0), 0) / matches.length).toFixed(1)
          : '—';

        statMatched.textContent = matches.length;
        statTop.textContent = topCount;
        statAvg.textContent = avg;
        statCrawled.textContent = crawled.length;
        statVetoed.textContent = rejections.length;
        statReports.textContent = reports.length;
        statSpan.textContent = (db.stats && db.stats.historySpan) || '—';
        if (db.updatedAt) datePill.textContent = 'Updated: ' + db.updatedAt;

        // Top-conviction share ring
        const share = matches.length ? Math.round((topCount / matches.length) * 100) : 0;
        statShare.textContent = share + '%';
        const ringLen = 2 * Math.PI * 52;
        ringVal.setAttribute('stroke-dasharray', ringLen.toFixed(1));
        ringVal.setAttribute('stroke-dashoffset', (ringLen * (1 - share / 100)).toFixed(1));

        badgeMatched.textContent = matches.length;
        badgeCrawled.textContent = crawled.length;
        badgeHistory.textContent = reports.length;
        badgeAudit.textContent = rejections.length;
        auditCountBadge.textContent = rejections.length + ' JDs vetoed';

        renderSpotlight(matches);
        renderActivity(reports);
      }

      // Ink spotlight card: highest-scoring approved match
      function renderSpotlight(matches) {
        const top = (matches || []).slice().sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];

        if (!top) {
          spotlightCard.innerHTML = \`
            <div class="spotlight-head">
              <span class="bento-label">Top pick</span>
            </div>
            <div class="spotlight-empty">No approved match yet — run an evaluation to populate the spotlight.</div>
            <div class="bento-deco" aria-hidden="true"></div>
          \`;
          return;
        }

        const salary = top.salary && top.salary !== 'Not specified' ? top.salary : '';
        const loc = (top.locations || [])[0] || 'Remote';
        const meta = salary || loc;
        const arrowIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';

        spotlightCard.innerHTML = \`
          <div class="spotlight-head">
            <span class="bento-label">Top pick</span>
            <a class="circle-btn" href="\${escapeHtml(top.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open posting">\${arrowIcon}</a>
          </div>
          <div class="spotlight-body">
            <div class="spotlight-score">\${Number(top.matchScore).toFixed(1)}<span>/ 10</span></div>
            <div class="spotlight-meta">
              <div class="spotlight-company">\${escapeHtml(top.company)}</div>
              <a class="spotlight-title" href="\${escapeHtml(top.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(top.title)}</a>
            </div>
          </div>
          <div class="bento-deco" aria-hidden="true"></div>
          <div class="spotlight-foot">
            <span class="spotlight-loc" title="\${escapeHtml(meta)}">\${escapeHtml(meta)}</span>
            <a class="square-cta" href="\${escapeHtml(top.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open \${escapeHtml(top.title)}">\${arrowIcon}</a>
          </div>
        \`;
      }

      // Per-run activity bars: matched (lime) vs vetoed (apricot)
      function renderActivity(reports) {
        const runs = (reports || []).slice().sort((a, b) =>
          (a.date + a.file) < (b.date + b.file) ? -1 : 1
        );
        chartMatched.textContent = runs.reduce((acc, r) => acc + (r.matched || 0), 0);
        chartVetoed.textContent = runs.reduce((acc, r) => acc + (r.rejected || 0), 0);

        if (!runs.length) {
          activityChart.innerHTML = '<span style="font-size:12px;color:var(--text-3);letter-spacing:0">No evaluation runs yet.</span>';
          return;
        }

        const max = Math.max(...runs.map(r => (r.matched || 0) + (r.rejected || 0)), 1);
        activityChart.innerHTML = runs.map(r => {
          const matched = r.matched || 0;
          const vetoed = r.rejected || 0;
          const vetoPct = (vetoed / max) * 100;
          const matchPct = matched ? Math.max((matched / max) * 100, 3.2) : 0;
          return \`<div class="bar-col" title="\${escapeHtml(r.date)} · \${matched} matched / \${vetoed} vetoed">
            <div class="bar-stack">
              <i class="bar-veto" style="height:\${vetoPct.toFixed(1)}%"></i>
              <i class="bar-match" style="height:\${matchPct.toFixed(1)}%"></i>
            </div>
            <span class="bar-x">\${escapeHtml((r.date || '').slice(5))}</span>
          </div>\`;
        }).join('');
      }

      // Build a single matched-job card
      function renderMatchCard(job) {
        const score = Number(job.matchScore) || 0;
        const tier = score >= 9 ? 'score-high' : score >= 8 ? 'score-good' : 'score-mid';
        const tierLabel = score >= 9 ? 'TOP' : score >= 8 ? 'STRONG' : 'FIT';

        const locTags = (job.locations || []).slice(0, 3).map(l =>
          \`<span class="kami-tag" onclick="window.filterByKeyword('\${escapeHtml(l)}')">\${escapeHtml(l)}</span>\`
        ).join(' ');

        const repeatBadge = (job.timesEvaluated || 1) > 1
          ? \`<span class="repeat-badge" title="Recommended in \${job.timesEvaluated} reports">↻ \${job.timesEvaluated}× evaluated</span>\`
          : '';

        return \`
            <article class="kami-card">
              <span class="score-watermark" aria-hidden="true">\${score.toFixed(1)}</span>
              <div class="card-body">
                <div class="card-header-row">
                  <div>
                    <div class="company-label">\${escapeHtml(job.company)}</div>
                    <h3 class="job-title">
                      <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(job.title)}</a>
                    </h3>
                  </div>
                  <div class="score-container">
                    <span class="score-badge \${tier}">\${score.toFixed(1)} · \${tierLabel}</span>
                    <span class="date-label">\${escapeHtml(job.postedAt)}</span>
                    \${repeatBadge}
                  </div>
                </div>

                <div class="tags-row">
                  \${locTags}
                  \${job.salary && job.salary !== 'Not specified' ? \`<span class="kami-tag salary-tag">\${escapeHtml(job.salary)}</span>\` : ''}
                  <span class="kami-tag source-tag">\${escapeHtml(job.source)}</span>
                </div>

                \${callout('why-box', 'Why it matches', '✦', job.whyMatch)}
                \${callout('tips-box', 'Application & interview tips', '↳', job.tips)}
              </div>

              <div class="card-footer">
                <div>
                  <div class="path-label">\${escapeHtml(job.localPath || '')}</div>
                  <div class="eval-chip">Evaluated \${escapeHtml(job.evaluatedAt || '')}\${job.reportFile ? ' · ' + escapeHtml(job.reportFile) : ''}</div>
                </div>
                <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
                  <span>Apply now</span>
                  <span class="arrow">↗</span>
                </a>
              </div>
            </article>
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

        const maxTotal = Math.max(...reports.map(r => (r.matched || 0) + (r.rejected || 0)), 1);

        historyList.innerHTML = reports.map(r => {
          const matched = r.matched || 0;
          const vetoed = r.rejected || 0;
          const matchPct = (matched / maxTotal) * 100;
          const vetoPct = (vetoed / maxTotal) * 100;
          return \`
          <div class="history-row">
            <span class="history-date">\${escapeHtml(r.date)}</span>
            <span class="history-file" title="\${escapeHtml(r.file)}">\${escapeHtml(r.file)}</span>
            <span class="history-bar" title="\${matched} matched / \${vetoed} vetoed">
              <i class="hb-match" style="width:\${matchPct.toFixed(1)}%"></i>
              <i class="hb-veto" style="width:\${vetoPct.toFixed(1)}%"></i>
            </span>
            <span class="history-counts">
              <span class="breaking-badge ok">\${matched} matched</span>
              <span class="breaking-badge">\${vetoed} vetoed</span>
            </span>
          </div>
        \`;
        }).join('');
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
            <div class="empty-state" style="border: 0; background: transparent;">
              <div class="empty-icon">📂</div>
              <p>No jobs found in knowledge base matching current search.</p>
            </div>
          \`;
          return;
        }

        const tableHead = \`
          <div class="table-row head" aria-hidden="true">
            <span></span><span>Role</span><span>Company</span><span>Source</span><span>Posted</span><span>Tags</span><span></span>
          </div>
        \`;

        crawledGrid.innerHTML = tableHead + filtered.map(job => {
          const source = String(job.source || 'unknown').split('(')[0].trim();
          const initial = (job.company || '?').trim().charAt(0).toUpperCase();
          const chips = (job.tags && job.tags.length) ? job.tags.slice(0, 2) : (job.locations || []).slice(0, 1);
          const tagPills = chips.map(t =>
            \`<span class="kami-tag" onclick="window.filterByKeyword('\${escapeHtml(t)}')" title="\${escapeHtml(t)}">\${escapeHtml(t)}</span>\`
          ).join('');

          return \`
            <div class="table-row">
              <div class="thumb" aria-hidden="true">\${escapeHtml(initial)}</div>
              <div style="min-width: 0;">
                <a class="cell-title" href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" title="\${escapeHtml(job.title)}">\${escapeHtml(job.title)}</a>
                <div class="cell-sub">\${escapeHtml(job.relPath || job.id || '')}</div>
              </div>
              <div class="cell-muted cell-hide">\${escapeHtml(job.company)}</div>
              <div class="cell-muted cell-hide"><span class="kami-tag source-tag">\${escapeHtml(source)}</span></div>
              <div class="cell-muted cell-hide">\${escapeHtml(job.postedAt)}</div>
              <div class="cell-tags cell-hide">\${tagPills || '<span class="cell-muted">—</span>'}</div>
              <a class="row-btn" href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open posting">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>
              </a>
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
              <span class="audit-reason">\${escapeHtml(r.reason)}</span>
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

      // Expand / collapse long analysis blocks
      document.addEventListener('click', (event) => {
        const btn = event.target.closest('.more-btn');
        if (!btn) return;
        const box = btn.closest('.callout-box');
        if (!box) return;
        const open = box.classList.toggle('expanded');
        btn.textContent = open ? 'Show less' : 'Read more';
      });

      // Reset filters
      const resetBtn = document.getElementById('resetFilters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          searchInput.value = '';
          scoreFilter.value = '0';
          sourceFilter.value = 'all';
          updateActiveView();
          searchInput.focus();
        });
      }

      // Theme toggle (persisted per browser)
      const themeBtn = document.getElementById('themeToggle');
      const themeLabel = document.getElementById('themeLabel');
      const THEME_KEY = 'jd-matcher-theme';
      const applyTheme = (dark) => {
        if (dark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          if (themeLabel) themeLabel.textContent = 'Ink';
        } else {
          document.documentElement.removeAttribute('data-theme');
          if (themeLabel) themeLabel.textContent = 'Frost';
        }
      };
      let savedTheme = null;
      try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* file:// may block storage */ }
      if (savedTheme) applyTheme(savedTheme === 'dark');
      let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeBtn.addEventListener('click', () => {
        isDark = !isDark;
        applyTheme(isDark);
        try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
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
