import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const API_URL = "https://www.workingnomads.com/api/exposed_jobs/";

export interface WorkingNomadsJobItem {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

export async function getWorkingNomadsJobs(limit = 100): Promise<CommonJob[]> {
  const resp = await fetch(API_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JdMatcherBot/1.0)",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Working Nomads API responded with status ${resp.status}`);
  }
  const data = await resp.json();
  return parseWorkingNomadsResponse(data, limit);
}

export function parseWorkingNomadsResponse(data: unknown, limit?: number): CommonJob[] {
  let list: WorkingNomadsJobItem[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object" && "jobs" in data && Array.isArray((data as { jobs: unknown[] }).jobs)) {
    list = (data as { jobs: WorkingNomadsJobItem[] }).jobs;
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
    if (typeof item.tags === "string" && item.tags.trim()) {
      item.tags.split(",").forEach((t) => {
        const cleaned = t.trim().toLowerCase();
        if (cleaned) tagSet.add(cleaned);
      });
    }
    if (item.category_name && typeof item.category_name === "string") {
      tagSet.add(item.category_name.trim().toLowerCase());
    }

    // Try to extract salary hint from description if present
    let salary = "";
    const salaryMatch = description.match(
      /(?:compensation|salary|rate of pay|earnings|pay|earn)(?:\s+is|\s*[:=-])?\s*([$€£][\d,]+(?:\s*[-–—to]+\s*[$€£]?[\d,]+)?(?:\s*(?:USD|EUR|GBP))?(?:\s*(?:per hour|\/hr|per year|\/yr|annually))?)/i
    );
    if (salaryMatch) {
      salary = salaryMatch[1].trim();
    }

    return {
      title,
      url: item.url ?? "",
      description,
      tags: Array.from(tagSet),
      location: item.location ?? "Anywhere",
      salary,
      updateTime: item.pub_date ?? "",
    };
  });
}
