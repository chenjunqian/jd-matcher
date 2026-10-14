import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import type { JobMarkdownDocument } from "./types.ts";
import { cleanHtmlToMarkdown, saveJobDocument, slugify } from "./utils.ts";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data/jds");

export const WWR_RSS_URLS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-design-jobs.rss",
  "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
  "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss",
  "https://weworkremotely.com/categories/remote-product-jobs.rss",
  "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss",
];

const REMOTEOK_BASE = "https://remoteok.com";
const REMOTIVE_API = "https://remotive.com/api/remote-jobs";
const JOBSPRESSO_RSS = "https://jobspresso.co/jobs/feed/";
const WORKINGNOMADS_API = "https://www.workingnomads.com/api/exposed_jobs/";
const NODESK_RSS = "https://nodesk.co/remote-jobs/index.xml";

/**
 * Robust fetch that falls back to curl if Node fetch is blocked by Cloudflare TLS fingerprints
 */
export async function safeFetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
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
          title: title || "Remote Opportunity",
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
 * Fetch and parse jobs from WeWorkRemotely RSS feeds (all categories)
 */
export async function crawlWeWorkRemotely(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const nowIso = new Date().toISOString();
  const seenUrls = new Set<string>();

  for (const feedUrl of WWR_RSS_URLS) {
    if (documents.length >= limit) break;

    try {
      const xml = await safeFetchText(feedUrl, {
        "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

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
 * Fetch and parse jobs from Remotive API (all job categories)
 */
export async function crawlRemotive(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const nowIso = new Date().toISOString();

  try {
    const rawJson = await safeFetchText(`${REMOTIVE_API}?limit=${limit}`, {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/json",
    });

    if (!rawJson) {
      console.warn(`[crawl] Remotive fetch failed or returned empty`);
      return [];
    }

    const data = JSON.parse(rawJson);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];

    for (const item of jobs.slice(0, limit)) {
      const id = item.id ? String(item.id) : slugify(item.title ?? "", 16);
      const title = String(item.title ?? "Remote Opportunity").trim();
      const company = String(item.company_name ?? "Unknown").trim();
      const url = String(item.url ?? "");
      const postedAt = item.publication_date ? new Date(item.publication_date).toISOString() : nowIso;
      const cleanedDesc = cleanHtmlToMarkdown(item.description ?? "");

      const tagSet = new Set<string>();
      if (Array.isArray(item.tags)) {
        for (const t of item.tags) {
          if (typeof t === "string" && t.trim()) tagSet.add(t.trim().toLowerCase());
        }
      }
      if (item.category && typeof item.category === "string") {
        tagSet.add(item.category.trim().toLowerCase());
      }
      if (item.job_type && typeof item.job_type === "string") {
        tagSet.add(item.job_type.trim().toLowerCase().replace("_", " "));
      }

      const locations = item.candidate_required_location
        ? [item.candidate_required_location]
        : ["Worldwide"];

      const doc: JobMarkdownDocument = {
        metadata: {
          id: `remotive-${id}`,
          title,
          company,
          source: "remotive",
          url,
          posted_at: postedAt,
          crawled_at: nowIso,
          locations,
          salary: String(item.salary ?? "").trim(),
          tags: Array.from(tagSet),
          status: "active",
        },
        markdownContent: `# ${title} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
      };

      documents.push(doc);
    }
  } catch (err) {
    console.error("[crawl] Error crawling Remotive:", err);
  }

  return documents;
}

/**
 * Fetch and parse jobs from Jobspresso RSS (all job categories)
 */
export async function crawlJobspresso(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const nowIso = new Date().toISOString();

  try {
    const rawXml = await safeFetchText(JOBSPRESSO_RSS, {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    });

    if (!rawXml) {
      console.warn(`[crawl] Jobspresso fetch failed or returned empty`);
      return [];
    }

    const json = parser.parse(rawXml);
    const items = json?.rss?.channel?.item;
    if (!items) return [];

    const arr = Array.isArray(items) ? items : [items];

    for (const item of arr.slice(0, limit)) {
      const title = String(item.title ?? "").trim();
      const rawCreator = String(item["dc:creator"] ?? "").trim();

      let company = "Unknown";
      let location = "Remote";
      if (rawCreator) {
        const parts = rawCreator
          .replace(/&(?:nbsp|#160);/gi, " ")
          .split(/<br\s*\/?>|⚲/i)
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) company = parts[0];
        if (parts.length > 1) location = parts[1];
      }

      const url = String(item.link ?? item.guid ?? "");
      const guid = String(item.guid ?? "");
      const idMatch = guid.match(/p=(\d+)/) || url.match(/\/job\/([^\/]+)/);
      const id = idMatch ? idMatch[1] : slugify(title, 16);

      const rawDesc = String(item["content:encoded"] ?? item.description ?? "");
      const cleanedDesc = cleanHtmlToMarkdown(rawDesc);

      const tagSet = new Set<string>();
      if (item.category) {
        const cats = Array.isArray(item.category) ? item.category : [item.category];
        for (const c of cats) {
          if (typeof c === "string" && c.trim()) tagSet.add(c.trim().toLowerCase());
        }
      }

      const postedAt = item.pubDate ? new Date(item.pubDate).toISOString() : nowIso;

      const doc: JobMarkdownDocument = {
        metadata: {
          id: `jobspresso-${id}`,
          title,
          company,
          source: "jobspresso",
          url,
          posted_at: postedAt,
          crawled_at: nowIso,
          locations: [location],
          salary: "",
          tags: Array.from(tagSet),
          status: "active",
        },
        markdownContent: `# ${title} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
      };

      documents.push(doc);
    }
  } catch (err) {
    console.error("[crawl] Error crawling Jobspresso:", err);
  }

  return documents;
}

/**
 * Fetch and parse jobs from Working Nomads API (all categories)
 */
export async function crawlWorkingNomads(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const nowIso = new Date().toISOString();

  try {
    const rawJson = await safeFetchText(WORKINGNOMADS_API, {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/json",
    });

    if (!rawJson) {
      console.warn(`[crawl] Working Nomads fetch failed or returned empty`);
      return [];
    }

    const data = JSON.parse(rawJson);
    const jobs = Array.isArray(data) ? data : Array.isArray(data?.jobs) ? data.jobs : [];

    for (const item of jobs.slice(0, limit)) {
      const url = String(item.url ?? "");
      const idMatch = url.match(/\/(\d+)\/?$/);
      const id = idMatch ? idMatch[1] : slugify(item.title ?? "", 16);
      const title = String(item.title ?? "Remote Opportunity").trim();
      const company = String(item.company_name ?? "Unknown").trim();
      const cleanedDesc = cleanHtmlToMarkdown(item.description ?? "");

      const tagSet = new Set<string>();
      if (typeof item.tags === "string" && item.tags.trim()) {
        item.tags.split(",").forEach((t: string) => {
          const cl = t.trim().toLowerCase();
          if (cl) tagSet.add(cl);
        });
      }
      if (item.category_name && typeof item.category_name === "string") {
        tagSet.add(item.category_name.trim().toLowerCase());
      }

      let salary = "";
      const salaryMatch = cleanedDesc.match(
        /(?:compensation|salary|rate of pay|earnings|pay|earn)(?:\s+is|\s*[:=-])?\s*([$€£][\d,]+(?:\s*[-–—to]+\s*[$€£]?[\d,]+)?(?:\s*(?:USD|EUR|GBP))?(?:\s*(?:per hour|\/hr|per year|\/yr|annually))?)/i
      );
      if (salaryMatch) {
        salary = salaryMatch[1].trim();
      }

      const postedAt = item.pub_date ? new Date(item.pub_date).toISOString() : nowIso;

      const doc: JobMarkdownDocument = {
        metadata: {
          id: `workingnomads-${id}`,
          title,
          company,
          source: "workingnomads",
          url,
          posted_at: postedAt,
          crawled_at: nowIso,
          locations: item.location ? [item.location] : ["Anywhere"],
          salary,
          tags: Array.from(tagSet),
          status: "active",
        },
        markdownContent: `# ${title} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
      };

      documents.push(doc);
    }
  } catch (err) {
    console.error("[crawl] Error crawling Working Nomads:", err);
  }

  return documents;
}

/**
 * Fetch and parse jobs from NoDesk RSS (all categories)
 */
export async function crawlNoDesk(limit = 50): Promise<JobMarkdownDocument[]> {
  const documents: JobMarkdownDocument[] = [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const nowIso = new Date().toISOString();

  try {
    const rawXml = await safeFetchText(NODESK_RSS, {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    });

    if (!rawXml) {
      console.warn(`[crawl] NoDesk fetch failed or returned empty`);
      return [];
    }

    const json = parser.parse(rawXml);
    const items = json?.rss?.channel?.item;
    if (!items) return [];

    const arr = Array.isArray(items) ? items : [items];

    for (const item of arr.slice(0, limit)) {
      const rawTitle = String(item.title ?? "").trim();
      let jobTitle = rawTitle;
      let company = "Unknown";

      // Pattern: "<Role> at <Company>"
      if (rawTitle.includes(" at ")) {
        const parts = rawTitle.split(" at ");
        jobTitle = parts[0].trim();
        company = parts.slice(1).join(" at ").trim();
      }

      const url = String(item.link ?? item.guid ?? "");
      const slugMatch = url.match(/\/remote-jobs\/([^\/]+)/);
      const id = slugMatch ? slugMatch[1] : slugify(rawTitle, 16);

      let location = "Anywhere / Remote";
      const locMatch = rawTitle.match(/\(([^)]*(?:Only|Remote|Anywhere|US|USA|Worldwide|Europe|Americas|APAC)[^)]*)\)/i);
      if (locMatch) {
        location = locMatch[1].trim();
      }

      const cleanedDesc = cleanHtmlToMarkdown(String(item.description ?? ""));

      const tagSet = new Set<string>();
      if (item.category) {
        const cats = Array.isArray(item.category) ? item.category : [item.category];
        for (const c of cats) {
          if (typeof c === "string" && c.trim()) tagSet.add(c.trim().toLowerCase());
        }
      }

      const postedAt = item.pubDate ? new Date(item.pubDate).toISOString() : nowIso;

      const doc: JobMarkdownDocument = {
        metadata: {
          id: `nodesk-${id}`,
          title: jobTitle,
          company,
          source: "nodesk",
          url,
          posted_at: postedAt,
          crawled_at: nowIso,
          locations: [location],
          salary: "",
          tags: Array.from(tagSet),
          status: "active",
        },
        markdownContent: `# ${jobTitle} - ${company}\n\n## Job Details\n\n${cleanedDesc}\n`,
      };

      documents.push(doc);
    }
  } catch (err) {
    console.error("[crawl] Error crawling NoDesk:", err);
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
      source = args[i + 1].toLowerCase();
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
    const docs = await crawlRemoteOk(limit);
    console.log(`[CRAWL] RemoteOK fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
  }

  if (source === "all" || source === "weworkremotely" || source === "wwr") {
    console.log(`[CRAWL] Fetching from WeWorkRemotely RSS...`);
    const docs = await crawlWeWorkRemotely(limit);
    console.log(`[CRAWL] WeWorkRemotely fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
  }

  if (source === "all" || source === "remotive") {
    console.log(`[CRAWL] Fetching from Remotive API...`);
    const docs = await crawlRemotive(limit);
    console.log(`[CRAWL] Remotive fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
  }

  if (source === "all" || source === "jobspresso") {
    console.log(`[CRAWL] Fetching from Jobspresso RSS...`);
    const docs = await crawlJobspresso(limit);
    console.log(`[CRAWL] Jobspresso fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
  }

  if (source === "all" || source === "workingnomads") {
    console.log(`[CRAWL] Fetching from Working Nomads API...`);
    const docs = await crawlWorkingNomads(limit);
    console.log(`[CRAWL] Working Nomads fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
  }

  if (source === "all" || source === "nodesk") {
    console.log(`[CRAWL] Fetching from NoDesk RSS...`);
    const docs = await crawlNoDesk(limit);
    console.log(`[CRAWL] NoDesk fetched: ${docs.length} jobs`);
    allDocs.push(...docs);
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
const isMain =
  Boolean(process.argv[1]) &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("crawl.ts"));

if (isMain) {
  run().catch((err) => {
    console.error("[CRAWL FATAL]", err);
    process.exit(1);
  });
}
