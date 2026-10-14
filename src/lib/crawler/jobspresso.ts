import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const RSS_URL = "https://jobspresso.co/jobs/feed/";

export async function getJobspressoJobs(): Promise<CommonJob[]> {
  const resp = await fetch(RSS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!resp.ok) {
    throw new Error(`Jobspresso feed responded with status ${resp.status}`);
  }
  const xml = await resp.text();
  return parseJobspressoRSS(xml);
}

export function parseJobspressoRSS(xml: string): CommonJob[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const json = parser.parse(xml);
  const items = json?.rss?.channel?.item;
  if (!items) return [];

  const arr = Array.isArray(items) ? items : [items];

  return arr.map((item: Record<string, unknown>) => {
    const rawTitle = String(item.title ?? "").trim();
    const rawCreator = String(item["dc:creator"] ?? "").trim();
    
    // Parse creator which often has format: Company<br>⚲ Location
    let company = "";
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

    const title = company ? `${company}: ${rawTitle}` : rawTitle;

    // Use full content:encoded if present, otherwise description
    const rawDesc = String(item["content:encoded"] ?? item.description ?? "");
    const $ = cheerio.load("<div>" + rawDesc + "</div>");
    const description = $("div").text().trim();

    // Extract tags from categories if any
    const tags: string[] = [];
    if (item.category) {
      const rawCategories = Array.isArray(item.category) ? item.category : [item.category];
      for (const cat of rawCategories) {
        if (typeof cat === "string" && cat.trim()) {
          tags.push(cat.trim().toLowerCase());
        }
      }
    }

    return {
      title,
      url: String(item.link ?? item.guid ?? ""),
      description,
      tags,
      location,
      salary: "",
      updateTime: String(item.pubDate ?? ""),
    };
  });
}
