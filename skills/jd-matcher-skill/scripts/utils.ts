import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import type {
  JobMarkdownDocument,
  JobMetadata,
  EvaluatedJobIndex,
  EvaluatedRecord,
} from "./types.ts";

/**
 * Convert string to safe filename slug
 */
export function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

/**
 * Extract Year (YYYY) and Month (MM) from an arbitrary date string,
 * falling back to current date if invalid.
 */
export function parseDateParts(dateStr?: string): { year: string; month: string } {
  let date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) {
    date = new Date();
  }
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return { year, month };
}

/**
 * Clean and convert raw HTML description to standard Markdown
 */
export function cleanHtmlToMarkdown(htmlText: string): string {
  if (!htmlText) return "";

  // If text already has no tags, return cleaned text
  if (!htmlText.includes("<") && !htmlText.includes(">")) {
    return htmlText.trim();
  }

  const $ = cheerio.load(htmlText, { xml: false });

  // Remove script, style, svg, iframe
  $("script, style, svg, iframe, noscript").remove();

  // Replace links with markdown links
  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    const text = $a.text().trim();
    if (href && text) {
      $a.replaceWith(`[${text}](${href})`);
    } else if (text) {
      $a.replaceWith(text);
    }
  });

  // Convert headings
  $("h1, h2").each((_, el) => {
    $(el).replaceWith(`\n\n## ${$(el).text().trim()}\n\n`);
  });
  $("h3, h4, h5, h6").each((_, el) => {
    $(el).replaceWith(`\n\n### ${$(el).text().trim()}\n\n`);
  });

  // Convert list items
  $("li").each((_, el) => {
    $(el).replaceWith(`\n- ${$(el).text().trim()}`);
  });

  // Convert paragraphs and line breaks
  $("p").each((_, el) => {
    $(el).replaceWith(`\n\n${$(el).text().trim()}\n\n`);
  });
  $("br").replaceWith("\n");

  const raw = $("body").length ? $("body").text() : $.text();

  // Normalize consecutive empty lines
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Generate YAML Frontmatter + Markdown string
 */
export function serializeMarkdownDocument(doc: JobMarkdownDocument): string {
  const { metadata, markdownContent } = doc;
  const escapeYaml = (str: string) => `"${str.replace(/"/g, '\\"')}"`;

  const yamlLines = [
    "---",
    `id: ${escapeYaml(metadata.id)}`,
    `title: ${escapeYaml(metadata.title)}`,
    `company: ${escapeYaml(metadata.company)}`,
    `source: ${escapeYaml(metadata.source)}`,
    `url: ${escapeYaml(metadata.url)}`,
    `posted_at: ${escapeYaml(metadata.posted_at)}`,
    `crawled_at: ${escapeYaml(metadata.crawled_at)}`,
    `locations: [${metadata.locations.map(escapeYaml).join(", ")}]`,
    `salary: ${escapeYaml(metadata.salary)}`,
    `tags: [${metadata.tags.map((t) => escapeYaml(t.toLowerCase())).join(", ")}]`,
    `status: ${escapeYaml(metadata.status)}`,
    "---",
    "",
  ];

  return yamlLines.join("\n") + markdownContent.trim() + "\n";
}

/**
 * Lightweight frontmatter parser
 */
export function parseFrontmatter(fileContent: string): {
  metadata: Partial<JobMetadata>;
  body: string;
} {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = fileContent.match(fmRegex);

  if (!match) {
    return { metadata: {}, body: fileContent };
  }

  const rawYaml = match[1];
  const body = match[2];
  const metadata: Record<string, any> = {};

  for (const line of rawYaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Check array like ["a", "b"]
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      metadata[key] = inner
        ? inner
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
        : [];
      continue;
    }

    // Strip quotes
    val = val.replace(/^["']|["']$/g, "");
    metadata[key] = val;
  }

  return { metadata: metadata as Partial<JobMetadata>, body };
}

/**
 * Save job document to data/jds/YYYY/MM/<filename>.md
 */
export function saveJobDocument(
  doc: JobMarkdownDocument,
  baseDir: string
): { saved: boolean; filePath: string; reason?: string } {
  const { year, month } = parseDateParts(doc.metadata.posted_at);
  const targetDir = path.join(baseDir, year, month);
  fs.mkdirSync(targetDir, { recursive: true });

  const slug = slugify(`${doc.metadata.company}-${doc.metadata.title}`);
  const fileName = `${doc.metadata.id}-${slug || "job"}.md`;
  const filePath = path.join(targetDir, fileName);

  if (fs.existsSync(filePath)) {
    return { saved: false, filePath, reason: "already_exists" };
  }

  const content = serializeMarkdownDocument(doc);
  fs.writeFileSync(filePath, content, "utf-8");
  return { saved: true, filePath };
}

/**
 * Normalize URL by removing query parameters, hash, and trailing slashes
 */
export function normalizeUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl.trim());
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return rawUrl.trim().split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Normalize title and company strings for robust key matching
 */
export function normalizeKey(text?: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Scan all markdown reports in data/matches (including subdirectories like archive)
 * to build a fast lookup index of all jobs that have been evaluated (matched or rejected).
 */
export function buildEvaluatedJobIndex(matchesDir: string): EvaluatedJobIndex {
  const index: EvaluatedJobIndex = {
    urls: new Set<string>(),
    ids: new Set<string>(),
    fileNames: new Set<string>(),
    companyTitleKeys: new Set<string>(),
    records: [],
  };

  if (!fs.existsSync(matchesDir)) {
    return index;
  }

  function collectReportFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectReportFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.endsWith(".example.md")) {
        results.push(full);
      }
    }
    return results;
  }

  const reportFiles = collectReportFiles(matchesDir);

  function registerRecord(record: EvaluatedRecord) {
    index.records.push(record);
    if (record.url) {
      const norm = normalizeUrl(record.url);
      if (norm) index.urls.add(norm);
    }
    if (record.id) {
      index.ids.add(record.id.toLowerCase());
    }
    if (record.localPath) {
      const base = path.basename(record.localPath).toLowerCase();
      index.fileNames.add(base);
      const m = base.match(/^((?:rok-\d+|wwr-[a-z0-9_-]+))/i);
      if (m) index.ids.add(m[1].toLowerCase());
    }
    const cKey = normalizeKey(record.company);
    const tKey = normalizeKey(record.title);
    if (cKey && tKey) {
      index.companyTitleKeys.add(`${cKey}:::${tKey}`);
    }
  }

  for (const reportPath of reportFiles) {
    const reportFileName = path.relative(matchesDir, reportPath);
    const content = fs.readFileSync(reportPath, "utf-8");

    // 1. Parse Top Matches blocks: "### <digits>. [<title>](<url>)"
    const matchBlocks = content.split(/###\s+\d+\.\s+/).slice(1);
    for (const block of matchBlocks) {
      const titleLinkMatch = block.match(/\[(.*?)\]\((.*?)\)/);
      if (!titleLinkMatch) continue;

      const title = titleLinkMatch[1].trim();
      const url = titleLinkMatch[2].trim();

      const companyMatch = block.match(/(?:Company|公司)[:\s*]+([^\n\r*]+)/i);
      const company = companyMatch ? companyMatch[1].trim() : "Unknown";

      const localPathMatch = block.match(/(?:Local File|本地归档)[:\s*]+`?([^\n\r`]+)`?/i);
      const localPath = localPathMatch ? localPathMatch[1].trim() : undefined;

      const sourceMatch = block.match(/(?:Source|来源)[:\s*]+([^\n\r*]+)/i);
      let id: string | undefined;
      if (sourceMatch) {
        const idMatch = sourceMatch[1].match(/`((?:rok-\d+|wwr-[a-z0-9_-]+))`?/i);
        if (idMatch) id = idMatch[1];
      }

      registerRecord({
        id,
        url,
        title,
        company,
        localPath,
        status: "matched",
        reportFile: reportFileName,
      });
    }

    // 2. Parse Hard Gate Rejections table
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
      if (
        inRejectionSection &&
        line.startsWith("|") &&
        !line.includes("---") &&
        !line.includes("公司") &&
        !line.includes("Company")
      ) {
        const parts = line.split("|").map((s) => s.trim()).filter(Boolean);
        if (
          parts.length >= 2 &&
          !parts[0].toLowerCase().includes("title") &&
          !parts[0].toLowerCase().includes("职位")
        ) {
          let title = parts[0];
          let url: string | undefined;
          const linkMatch = title.match(/\[(.*?)\]\((.*?)\)/);
          if (linkMatch) {
            title = linkMatch[1].trim();
            url = linkMatch[2].trim();
          }
          const company = parts[1].replace(/[*_]/g, "").trim();

          registerRecord({
            url,
            title,
            company,
            status: "rejected",
            reportFile: reportFileName,
          });
        }
      }
    }
  }

  // Also check records.json / history.json if present
  const jsonPaths = [path.join(matchesDir, "records.json"), path.join(matchesDir, "history.json")];
  for (const jp of jsonPaths) {
    if (fs.existsSync(jp)) {
      try {
        const items = JSON.parse(fs.readFileSync(jp, "utf-8"));
        if (Array.isArray(items)) {
          for (const item of items) {
            registerRecord({
              id: item.id,
              url: item.url,
              title: item.title || "",
              company: item.company || "",
              localPath: item.localPath,
              status: item.status === "rejected" ? "rejected" : "matched",
              reportFile: path.basename(jp),
            });
          }
        }
      } catch {
        // ignore malformed json
      }
    }
  }

  return index;
}

/**
 * Check if a given job matches an already evaluated job record.
 */
export function checkJobEvaluated(
  job: {
    id?: string;
    url?: string;
    title?: string;
    company?: string;
    filePath?: string;
    relPath?: string;
  },
  index: EvaluatedJobIndex
): { evaluated: boolean; status?: "matched" | "rejected"; reportFile?: string } {
  // 1. Match by ID
  if (job.id && index.ids.has(job.id.toLowerCase())) {
    const rec = index.records.find((r) => r.id?.toLowerCase() === job.id?.toLowerCase());
    return { evaluated: true, status: rec?.status || "matched", reportFile: rec?.reportFile };
  }

  // 2. Match by normalized URL
  if (job.url) {
    const nUrl = normalizeUrl(job.url);
    if (nUrl && index.urls.has(nUrl)) {
      const rec = index.records.find((r) => r.url && normalizeUrl(r.url) === nUrl);
      return { evaluated: true, status: rec?.status || "matched", reportFile: rec?.reportFile };
    }
  }

  // 3. Match by file basename
  if (job.filePath) {
    const base = path.basename(job.filePath).toLowerCase();
    if (index.fileNames.has(base)) {
      const rec = index.records.find(
        (r) => r.localPath && path.basename(r.localPath).toLowerCase() === base
      );
      return { evaluated: true, status: rec?.status || "matched", reportFile: rec?.reportFile };
    }
  }

  // 4. Match by normalized Company + Title combination
  const cKey = normalizeKey(job.company);
  const tKey = normalizeKey(job.title);
  if (cKey && tKey) {
    const compositeKey = `${cKey}:::${tKey}`;
    if (index.companyTitleKeys.has(compositeKey)) {
      const rec = index.records.find(
        (r) => `${normalizeKey(r.company)}:::${normalizeKey(r.title)}` === compositeKey
      );
      return { evaluated: true, status: rec?.status || "matched", reportFile: rec?.reportFile };
    }
  }

  return { evaluated: false, status: undefined };
}
