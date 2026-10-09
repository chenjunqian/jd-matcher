import * as path from "node:path";
import { execSync } from "node:child_process";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import type { JobMarkdownDocument } from "./types.ts";
import { cleanHtmlToMarkdown, saveJobDocument, slugify } from "./utils.ts";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data/jds");

const WWR_RSS_URLS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
];

const REMOTEOK_BASE = "https://remoteok.com";

/**
 * Robust fetch that falls back to curl if Node fetch is blocked by Cloudflare TLS fingerprints
 */
async function safeFetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const resp = await fetch(url, { headers });
    if (resp.ok) {
      return await resp.text();
    }
  } catch {
    // continue to fallback
  }

  // Fallback to system curl
  try {
    const raw = execSync(`curl -s -L --max-time 15 "${url}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (raw && raw.length > 50) {
      return raw;
    }
  } catch (err) {
    console.warn(`[safeFetchText] curl fallback failed for ${url}:`, err);
  }

  return null;
}

/**
 * Fetch and parse jobs from RemoteOK
 */
export async function crawlRemoteOk(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  try {
    const rawHtml = await safeFetchText(`${REMOTEOK_BASE}/?action=get_jobs&offset=1`, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
    });

    if (!rawHtml) {
      console.warn(`[crawl] RemoteOK fetch failed or returned empty`);
      return [];
    }

    let html = rawHtml.trim();
    if (html.startsWith("<tr")) html = "<table>" + html + "</table>";

    const $ = cheerio.load(html);
    const nowIso = new Date().toISOString();

    $("tr.expand").each((_i, el) => {
      if (documents.length >= limit) return false;

      const $el = $(el);
      const dataId = $el.attr("data-id");
      if (!dataId) return;

      const header = $(`tr.job-${dataId}`);
      if (!header.length) return;

      const jobUrl = header.attr("data-url") ?? "";
      const title = header.find("td.company_and_position h2").text().trim();
      const company = header.find("td.company_and_position h3").text().trim();

      const htmlDiv = $el.find("div.html");
      const mdDiv = $el.find("div.markdown");
      const rawDesc = htmlDiv.length ? htmlDiv.html() ?? "" : mdDiv.length ? mdDiv.text() : "";
      const cleanedDesc = cleanHtmlToMarkdown(rawDesc);

      const locDivs = header.find("div.location");
      const locs: string[] = [];
      locDivs.each((_j, e) => {
        const t = $(e).text().trim();
        if (!t) return;
        if (/^⏰\s/.test(t)) return;
        if (t.includes("Upgrade to Premium")) return;
        const cleaned = t.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}\s]+/gu, "").trim();
        locs.push(cleaned || t);
      });

      const salaryDiv = header.find("div.salary");
      let salary = salaryDiv.length ? salaryDiv.text().trim() : "";
      if (salary.includes("Upgrade to Premium")) salary = "";

      const time = header.find("time").attr("datetime") ?? nowIso;
      const tags: string[] = [];
      header.find("td.tags h3").each((_j, e) => {
        const tag = $(e).text().trim();
        if (tag) tags.push(tag.toLowerCase());
      });

      const doc: JobMarkdownDocument = {
        metadata: {
          id: `rok-${dataId}`,
          title: title || "Software Engineer",
          company: company || "Unknown",
          source: "remoteok",
          url: jobUrl.startsWith("http") ? jobUrl : `${REMOTEOK_BASE}${jobUrl}`,
          posted_at: time,
          crawled_at: nowIso,
          locations: locs.length ? locs : ["Worldwide"],
          salary,
          tags,
          status: "active",
        },
        markdownContent: `# ${title} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
      };

      documents.push(doc);
    });
  } catch (err) {
    console.error("[crawl] Error crawling RemoteOK:", err);
  }

  return documents;
}

/**
 * Fetch and parse jobs from WeWorkRemotely RSS feeds
 */
export async function crawlWeWorkRemotely(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const nowIso = new Date().toISOString();

  for (const feedUrl of WWR_RSS_URLS) {
    if (documents.length >= limit) break;

    try {
      const xml = await safeFetchText(feedUrl, {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });

      if (!xml) continue;
      const json = parser.parse(xml);
      const items = json?.rss?.channel?.item;
      if (!items) continue;

      const arr = Array.isArray(items) ? items : [items];

      for (const item of arr) {
        if (documents.length >= limit) break;

        const rawTitle = String(item.title ?? "").trim();
        let company = "Unknown";
        let jobTitle = rawTitle;

        if (rawTitle.includes(":")) {
          const parts = rawTitle.split(":");
          company = parts[0].trim();
          jobTitle = parts.slice(1).join(":").trim();
        }

        const url = String(item.link ?? "");
        const idMatch = url.match(/remote-jobs\/(?:.*-)?(\d+)/) || url.match(/\/([^\/?#]+)$/);
        const wwrId = idMatch ? idMatch[1] : slugify(rawTitle, 16);

        const rawDesc = String(item.description ?? "");
        const cleanedDesc = cleanHtmlToMarkdown(rawDesc);

        const category = String(item.category ?? "");
        const skills = String(item.skills ?? "");
        const tagSet = new Set<string>();

        for (const t of category.split(/[\s,]+/)) {
          if (t.trim()) tagSet.add(t.trim().toLowerCase());
        }
        for (const t of skills.split(/[,]+/)) {
          const cleanedTag = t.trim().toLowerCase().replace(/^and\s+/, "");
          if (cleanedTag) tagSet.add(cleanedTag);
        }

        const region = String(item.region ?? "").trim();
        const locations = region ? [region] : ["Anywhere in the World"];
        const postedAt = item.pubDate ? new Date(item.pubDate).toISOString() : nowIso;

        const doc: JobMarkdownDocument = {
          metadata: {
            id: `wwr-${wwrId}`,
            title: jobTitle || rawTitle,
            company,
            source: "weworkremotely",
            url,
            posted_at: postedAt,
            crawled_at: nowIso,
            locations,
            salary: "",
            tags: Array.from(tagSet),
            status: "active",
          },
          markdownContent: `# ${jobTitle} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
        };

        documents.push(doc);
      }
    } catch (err) {
      console.error(`[crawl] Error fetching WWR feed ${feedUrl}:`, err);
    }
  }

  return documents;
}

/**
 * Main runner
 */
async function run() {
  const args = process.argv.slice(2);
  let limit = 40;
  let source = "all";
  let outDir = DEFAULT_DATA_DIR;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10) || 40;
      i++;
    } else if (args[i] === "--source" && args[i + 1]) {
      source = args[i + 1];
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = path.resolve(process.cwd(), args[i + 1]);
      i++;
    }
  }

  console.log(`[CRAWL] Starting job crawler...`);
  console.log(`[CRAWL] Target output: ${outDir}`);
  console.log(`[CRAWL] Mode: source=${source}, limit=${limit}`);

  const allDocs: JobMarkdownDocument[] = [];

  if (source === "all" || source === "remoteok") {
    console.log(`[CRAWL] Fetching from RemoteOK...`);
    const rokDocs = await crawlRemoteOk(limit);
    console.log(`[CRAWL] RemoteOK fetched: ${rokDocs.length} jobs`);
    allDocs.push(...rokDocs);
  }

  if (source === "all" || source === "weworkremotely") {
    console.log(`[CRAWL] Fetching from WeWorkRemotely RSS...`);
    const wwrDocs = await crawlWeWorkRemotely(limit);
    console.log(`[CRAWL] WeWorkRemotely fetched: ${wwrDocs.length} jobs`);
    allDocs.push(...wwrDocs);
  }

  let savedCount = 0;
  let skippedCount = 0;

  for (const doc of allDocs) {
    const res = saveJobDocument(doc, outDir);
    if (res.saved) {
      savedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log("==========================================");
  console.log(`[CRAWL SUMMARY] Ingestion Complete!`);
  console.log(`- Total jobs fetched:  ${allDocs.length}`);
  console.log(`- Newly saved to KB:   ${savedCount}`);
  console.log(`- Skipped (duplicate): ${skippedCount}`);
  console.log("==========================================");
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("[CRAWL FATAL]", err);
    process.exit(1);
  });
}
