import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { parseFrontmatter } from "./utils.ts";

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

export interface MatchedJobRecord {
  id: string;
  title: string;
  company: string;
  source: string;
  url: string;
  postedAt: string;
  evaluatedAt: string;
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
}

export interface DashboardDataBundle {
  updatedAt: string;
  stats: {
    totalCrawled: number;
    totalMatched: number;
    topMatches: number;
    avgScore: string;
    totalVetoed: number;
  };
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

/**
 * Parse markdown report files in data/matches/*.md into structured records
 */
export function parseReportsFromDir(dirPath: string): {
  matches: MatchedJobRecord[];
  rejections: RejectionRecord[];
} {
  const matches: MatchedJobRecord[] = [];
  const rejections: RejectionRecord[] = [];

  if (!fs.existsSync(dirPath)) return { matches, rejections };

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const content = fs.readFileSync(fullPath, "utf-8");
    const evalDateMatch = content.match(/评估时间|Evaluation Date[:\s]*([0-9-]+)/i);
    const evaluatedAt = evalDateMatch ? evalDateMatch[1] : file.slice(0, 10);

    // Parse Job Sections
    const jobBlocks = content.split(/###\s+\d+\.\s+/).slice(1);
    for (const block of jobBlocks) {
      const titleMatch = block.match(/\[(.*?)\]\((.*?)\)/);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      const url = titleMatch[2].trim();

      const companyMatch = block.match(/(?:Company|公司)[:\s*]+([^\n\r*]+)/i);
      const company = companyMatch ? companyMatch[1].trim() : "Unknown";

      const sourceMatch = block.match(/(?:Source|来源)[:\s*]+([^\n\r*]+)/i);
      const source = sourceMatch ? sourceMatch[1].trim() : "RemoteOK";

      const postedMatch = block.match(/(?:Posted|发布时间)[:\s*]+([^\n\r*]+)/i);
      const postedAt = postedMatch ? postedMatch[1].trim() : "Recent";

      const locMatch = block.match(/(?:Locations?|地点要求)[:\s*]+([^\n\r*]+)/i);
      const locations = locMatch
        ? locMatch[1].split(/[,，]/).map((s) => s.trim())
        : ["Worldwide"];

      const salMatch = block.match(/(?:Salary|公开薪酬)[:\s*]+([^\n\r*]+)/i);
      const salary = salMatch ? salMatch[1].trim() : "Not specified";

      const scoreMatch = block.match(/(?:Match Score|匹配得分)[:\s*]+(?:\*\*)?([0-9.]+)/i);
      const matchScore = scoreMatch ? parseFloat(scoreMatch[1]) : 7.0;

      const localPathMatch = block.match(/(?:Local File|本地归档)[:\s*]+`?([^\n\r`]+)`?/i);
      const localPath = localPathMatch ? localPathMatch[1].trim() : undefined;

      const whyMatchBlock = block.match(
        /(?:Why Match|核心契合点)[^:]*[:\s*]+([\s\S]*?)(?=(?:投递与面试建议|Application Tips|###|$))/i
      );
      const whyMatch = whyMatchBlock
        ? whyMatchBlock[1]
            .split("\n")
            .map((l) => l.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean)
            .join(" ")
        : "Strong alignment with candidate stack and experience.";

      const tipsBlock = block.match(/(?:Application Tips|投递与面试建议)[^:]*[:\s*]+([\s\S]*?)(?=(?:###|##|$))/i);
      const tips = tipsBlock
        ? tipsBlock[1]
            .split("\n")
            .map((l) => l.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean)
            .join(" ")
        : "Tailor resume highlights for this specific JD.";

      matches.push({
        id: `job-${matches.length + 1}`,
        title,
        company,
        source,
        url,
        postedAt,
        evaluatedAt,
        locations,
        salary,
        matchScore,
        whyMatch,
        tips,
        localPath,
      });
    }

    // Parse Rejection Table rows
    const lines = content.split("\n");
    let inRejectionSection = false;
    for (const line of lines) {
      if (line.match(/排除与拒否|Hard Gate Rejections|Rejected/i)) {
        inRejectionSection = true;
        continue;
      }
      if (inRejectionSection && line.startsWith("## ")) {
        inRejectionSection = false;
      }
      if (inRejectionSection && line.startsWith("|") && !line.includes("---") && !line.includes("公司")) {
        const cols = line.split("|").map((s) => s.trim()).filter(Boolean);
        if (cols.length >= 3 && !cols[0].toLowerCase().includes("title") && !cols[0].toLowerCase().includes("职位")) {
          rejections.push({
            title: cols[0],
            company: cols[1],
            reason: cols[2].replace(/^[❌⛔\s]+/, ""),
          });
        }
      }
    }
  }

  // Also read records.json if present
  const jsonPath = path.join(dirPath, "records.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const extra = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (Array.isArray(extra)) {
        matches.push(...extra);
      }
    } catch {
      // ignore malformed json
    }
  }

  // Deduplicate matches by URL
  const seen = new Set<string>();
  const uniqueMatches = matches.filter((m) => {
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });

  return { matches: uniqueMatches, rejections };
}

/**
 * Build aggregated data bundle combining crawled JDs and evaluated matches
 */
export function buildDashboardDataBundle(
  matchesDir = DEFAULT_MATCHES_DIR,
  jdsDir = DEFAULT_JDS_DIR
): DashboardDataBundle {
  const { matches, rejections } = parseReportsFromDir(matchesDir);
  const crawledJds = getAllCrawledJds(jdsDir);

  const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);
  const topMatches = sortedMatches.filter((m) => m.matchScore >= 8.5).length;
  const avgScore = sortedMatches.length
    ? (sortedMatches.reduce((acc, m) => acc + m.matchScore, 0) / sortedMatches.length).toFixed(1)
    : "0.0";
  const updatedAt = new Date().toISOString().split("T")[0];

  return {
    updatedAt,
    stats: {
      totalCrawled: crawledJds.length,
      totalMatched: sortedMatches.length,
      topMatches,
      avgScore,
      totalVetoed: rejections.length,
    },
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
  crawledJds: CrawledJobSummary[] = []
): string {
  const sortedMatches = [...matches].sort((a, b) => b.matchScore - a.matchScore);
  const topMatches = sortedMatches.filter((m) => m.matchScore >= 8.5).length;
  const avgScore = sortedMatches.length
    ? (sortedMatches.reduce((acc, m) => acc + m.matchScore, 0) / sortedMatches.length).toFixed(1)
    : "0.0";
  const updatedAt = new Date().toISOString().split("T")[0];

  const initialBundle: DashboardDataBundle = {
    updatedAt,
    stats: {
      totalCrawled: crawledJds.length,
      totalMatched: sortedMatches.length,
      topMatches,
      avgScore,
      totalVetoed: rejections.length,
    },
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
       kami · 紙 Design System Tokens
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
      font-family: var(--sans);
    }
    .path-label {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--stone);
      max-width: 240px;
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

    <!-- Tab View 1: Matched Recommendations -->
    <section id="matchesView" class="tab-view active">
      <div id="matchesGrid" class="cards-grid"></div>
    </section>

    <!-- Tab View 2: All Crawled Jobs in Knowledge Base -->
    <section id="crawledView" class="tab-view">
      <div id="crawledGrid" class="cards-grid"></div>
    </section>

    <!-- Tab View 3: Veto Audit Log -->
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
      Styled with <a href="https://github.com/tw93/kami" target="_blank" rel="noopener noreferrer">kami · 紙</a> Design System · Warm Parchment, Ink-Blue Accent & Serif Hierarchy
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
          stats: { totalCrawled: 0, totalMatched: 0, topMatches: 0, avgScore: "0.0", totalVetoed: 0 },
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
      const datePill = document.getElementById('datePill');

      const badgeMatched = document.getElementById('badgeMatched');
      const badgeCrawled = document.getElementById('badgeCrawled');
      const badgeAudit = document.getElementById('badgeAudit');
      const auditCountBadge = document.getElementById('auditCountBadge');

      const searchInput = document.getElementById('searchInput');
      const scoreFilter = document.getElementById('scoreFilter');
      const sourceFilter = document.getElementById('sourceFilter');
      const resultsCount = document.getElementById('resultsCount');

      const matchesGrid = document.getElementById('matchesGrid');
      const crawledGrid = document.getElementById('crawledGrid');
      const auditTableBody = document.getElementById('auditTableBody');

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
        if (db.updatedAt) datePill.textContent = 'Updated: ' + db.updatedAt;

        badgeMatched.textContent = db.matches.length;
        badgeCrawled.textContent = db.crawledJds.length;
        badgeAudit.textContent = db.rejections.length;
        auditCountBadge.textContent = db.rejections.length + ' JDs vetoed';
      }

      // Render Matched Recommendations View
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
            <div class="empty-state" style="grid-column: 1 / -1;">
              <div class="empty-icon">🍃</div>
              <p>No matching recommendations found for current filters.</p>
            </div>
          \`;
          return;
        }

        matchesGrid.innerHTML = filtered.map(job => {
          let scoreBadgeStyle = "background: #e8e6dc; color: #3d3d3a; border: 1px solid #d8d5c8;";
          if (job.matchScore >= 9.0) {
            scoreBadgeStyle = "background: #1B365D; color: #faf9f5; border: 1px solid #1B365D;";
          } else if (job.matchScore >= 8.0) {
            scoreBadgeStyle = "background: #E4ECF5; color: #1B365D; border: 1px solid #c7d8eb;";
          }

          const locTags = (job.locations || []).slice(0, 3).map(l =>
            \`<span class="kami-tag" onclick="window.filterByKeyword('\${escapeHtml(l)}')">\${escapeHtml(l)}</span>\`
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
                    <span class="score-badge" style="\${scoreBadgeStyle}">\${Number(job.matchScore).toFixed(1)} / 10</span>
                    <span class="date-label">\${escapeHtml(job.postedAt)}</span>
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
                <div class="path-label">\${escapeHtml(job.localPath || '')}</div>
                <a href="\${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
                  <span>Apply Now</span>
                  <span class="arrow">↗</span>
                </a>
              </div>
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
  const html = generateDashboardHtml(bundle.matches, bundle.rejections, bundle.crawledJds);
  fs.writeFileSync(DASHBOARD_OUTPUT_PATH, html, "utf-8");

  console.log(`[DASHBOARD] Successfully written:`);
  console.log(`  - HTML Shell:   ${DASHBOARD_OUTPUT_PATH}`);
  console.log(`  - JSON Dataset: ${DATA_JSON_PATH}`);
  console.log(`  - JS Loader:    ${DATA_JS_PATH}`);
  console.log(`- Total Crawled JDs:      ${bundle.stats.totalCrawled}`);
  console.log(`- Matched Opportunities:  ${bundle.stats.totalMatched}`);
  console.log(`- Excluded JDs:           ${bundle.stats.totalVetoed}`);

  if (shouldOpen) {
    openInBrowser(DASHBOARD_OUTPUT_PATH);
  }

  return { htmlPath: DASHBOARD_OUTPUT_PATH, jsonPath: DATA_JSON_PATH, jsPath: DATA_JS_PATH };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const shouldOpen = args.includes("--open");
  runDashboard(DEFAULT_MATCHES_DIR, DEFAULT_JDS_DIR, shouldOpen);
}
