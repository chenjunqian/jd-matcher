import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const BASE_URL = "https://remotive.com/api/remote-jobs";

export interface RemotiveJobItem {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export async function getRemotiveJobs(limit = 100): Promise<CommonJob[]> {
  const url = limit > 0 ? `${BASE_URL}?limit=${limit}` : BASE_URL;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
    },
  });
  if (!resp.ok) {
    throw new Error(`Remotive API responded with status ${resp.status}`);
  }
  const data = await resp.json();
  return parseRemotiveResponse(data, limit);
}

export function parseRemotiveResponse(data: unknown, limit?: number): CommonJob[] {
  let list: RemotiveJobItem[] = [];
  if (data && typeof data === "object") {
    if ("jobs" in data && Array.isArray((data as { jobs: unknown[] }).jobs)) {
      list = (data as { jobs: RemotiveJobItem[] }).jobs;
    } else if (Array.isArray(data)) {
      list = data as RemotiveJobItem[];
    }
  }

  if (typeof limit === "number" && limit > 0) {
    list = list.slice(0, limit);
  }

  return list.map((item) => {
    const title = item.company_name
      ? `${item.company_name}: ${item.title ?? ""}`
      : item.title ?? "";

    const descHtml = item.description ?? "";
    const $ = cheerio.load("<div>" + descHtml + "</div>");
    const description = $("div").text().trim();

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

    return {
      title,
      url: item.url ?? "",
      description,
      tags: Array.from(tagSet),
      location: item.candidate_required_location ?? "Worldwide",
      salary: item.salary ?? "",
      updateTime: item.publication_date ?? "",
    };
  });
}
