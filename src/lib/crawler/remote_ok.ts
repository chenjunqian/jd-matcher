import * as cheerio from "cheerio";
import type { CommonJob } from "../types.js";

const BASE = "https://remoteok.com";

export async function getRemoteOkJobs(offset = 1): Promise<CommonJob[]> {
  const resp = await fetch(`${BASE}/?action=get_jobs&offset=${offset}`);
  const html = await resp.text();
  return parseRemoteOkMainPageJobs(html);
}

export function parseRemoteOkMainPageJobs(htmlStr: string): CommonJob[] {
  const jobs: CommonJob[] = [];
  let html = htmlStr.trim();
  if (html.startsWith("<tr")) html = "<table>" + html + "</table>";

  const $ = cheerio.load(html);
  $("tr.expand").each((_i, el) => {
    try {
      const $el = $(el);
      const dataId = $el.attr("data-id");
      if (!dataId) return;

      const header = $(`tr.job-${dataId}`);
      if (!header.length) return;

      const jobUrl = header.attr("data-url") ?? "";
      const title = header.find("td.company_and_position h2").text().trim();

      const htmlDiv = $el.find("div.html");
      const mdDiv = $el.find("div.markdown");
      const desc = htmlDiv.length ? htmlDiv.text() : mdDiv.length ? mdDiv.text() : "";

      const locDivs = header.find("div.location");
      const salaryDiv = header.find("div.salary");

      const locs: string[] = [];
      locDivs.each((_i, e) => {
        const t = $(e).text().trim();
        if (!t) return;
        if (/^⏰\s/.test(t)) return; // employment type (Part time, Full time, Contractor)
        if (t.includes("Upgrade to Premium")) return; // "💰 Upgrade to Premium to see salary"
        locs.push(t);
      });

      let salary = salaryDiv.length ? salaryDiv.text().trim() : "";
      if (!salary) {
        const premium = header.find("div.location").filter((_i, e) => $(e).text().includes("Upgrade to Premium"));
        if (premium.length) salary = premium.text().trim();
      }

      const time = header.find("time").attr("datetime") ?? "";
      const tags: string[] = [];
      header.find("td.tags h3").each((_j, e) => { tags.push($(e).text().trim()); });

      jobs.push({
        title,
        url: BASE + jobUrl,
        description: desc.trim(),
        tags,
        location: locs.join(","),
        salary,
        updateTime: time,
      });
    } catch {
      /* skip malformed */
    }
  });
  return jobs;
}
