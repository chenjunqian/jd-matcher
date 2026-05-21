import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const RSS_URLS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
];

export async function getAllFullStackJobs(): Promise<CommonJob[]> {
  const all: CommonJob[] = [];
  const errors: Error[] = [];
  for (const url of RSS_URLS) {
    try {
      const resp = await fetch(url);
      all.push(...parseWeworkremotelyRSSResp(await resp.text()));
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }
  if (errors.length && all.length === 0) throw new AggregateError(errors, "all RSS feeds failed");
  return all;
}

export function parseWeworkremotelyRSSResp(xml: string): CommonJob[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const json = parser.parse(xml);
  const items = json?.rss?.channel?.item;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((item: Record<string, string>) => {
    const $ = cheerio.load("<div>" + (item.description ?? "") + "</div>");
    return {
      title: item.title ?? "",
      url: item.link ?? "",
      description: $("div").text().trim(),
      tags: ((item.category ?? "") as string).split(" "),
      location: item.region ?? "",
      salary: "",
      updateTime: item.pubDate ?? "",
    };
  });
}
