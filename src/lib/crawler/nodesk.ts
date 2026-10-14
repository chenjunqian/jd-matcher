import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const RSS_URL = "https://nodesk.co/remote-jobs/index.xml";

export async function getNoDeskJobs(): Promise<CommonJob[]> {
  const resp = await fetch(RSS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!resp.ok) {
    throw new Error(`NoDesk feed responded with status ${resp.status}`);
  }
  const xml = await resp.text();
  return parseNoDeskRSS(xml);
}

export function parseNoDeskRSS(xml: string): CommonJob[] {
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
    const rawDesc = String(item.description ?? "");
    const $ = cheerio.load("<div>" + rawDesc + "</div>");
    const description = $("div").text().trim();

    // NoDesk titles often format as: "<Role Title> at <Company>"
    // or "<Role Title> (Location/Constraint) at <Company>"
    let location = "Anywhere / Remote";
    const locInTitle = rawTitle.match(/\(([^)]*(?:Only|Remote|Anywhere|US|USA|Worldwide|Europe|Americas|APAC)[^)]*)\)/i);
    if (locInTitle) {
      location = locInTitle[1].trim();
    }

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
      title: rawTitle,
      url: String(item.link ?? item.guid ?? ""),
      description,
      tags,
      location,
      salary: "",
      updateTime: String(item.pubDate ?? ""),
    };
  });
}
