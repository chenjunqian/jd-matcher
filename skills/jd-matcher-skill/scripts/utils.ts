import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import type { JobMarkdownDocument, JobMetadata } from "./types.ts";

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
