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
      const locs: string[] = [];
      let salary = "";
      locDivs.each((i, e) => {
        const t = $(e).text().trim();
        if (i === locDivs.length - 1) salary = t;
        else locs.push(t);
      });

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
