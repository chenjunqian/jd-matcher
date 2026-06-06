import { describe, it, expect } from "vitest";
import { parseWeworkremotelyRSSResp } from "./weworkremotely";
import * as fs from "fs";
import * as path from "path";

const fixture = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "weworkremotely_test.rss"),
  "utf-8"
);

describe("parseWeworkremotelyRSSResp", () => {
  const jobs = parseWeworkremotelyRSSResp(fixture);

  it("parses all 3 jobs", () => {
    expect(jobs).toHaveLength(3);
  });

  it("parses job title", () => {
    expect(jobs[0].title).toBe(
      "Varicent: Support Engineer – SQL & Web Applications (Remote - Mexico Only)"
    );
  });

  it("parses URL", () => {
    expect(jobs[0].url).toBe(
      "https://weworkremotely.com/remote-jobs/varicent-support-engineer-sql-web-applications-remote-mexico-only"
    );
  });

  it("parses location from region field", () => {
    for (const job of jobs) {
      expect(job.location).toBe("Anywhere in the World");
    }
  });

  it("salary is always empty (not in RSS)", () => {
    for (const job of jobs) {
      expect(job.salary).toBe("");
    }
  });

  it("parses tags from category field (space-separated)", () => {
    expect(jobs[0].tags).toEqual(["Full-Stack", "Programming"]);
  });

  it("extracts description text from HTML", () => {
    for (const job of jobs) {
      expect(job.description.length).toBeGreaterThan(0);
      expect(job.description).not.toContain("<");
      expect(job.description).not.toContain(">");
    }
  });

  it("parses updateTime from pubDate", () => {
    for (const job of jobs) {
      expect(job.updateTime).toBeTruthy();
      expect(job.updateTime).toContain("2026");
    }
  });

  it("returns empty array for empty RSS", () => {
    const empty = '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';
    expect(parseWeworkremotelyRSSResp(empty)).toEqual([]);
  });

  it("handles single item (not wrapped in array)", () => {
    // Extract just the first <item>...</item> from the fixture
    const match = fixture.match(/<item>[\s\S]*?<\/item>/);
    expect(match).toBeTruthy();
    const singleItemXml =
      '<?xml version="1.0"?><rss version="2.0"><channel>' +
      match![0] +
      "</channel></rss>";
    const jobs = parseWeworkremotelyRSSResp(singleItemXml);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe(
      "Varicent: Support Engineer – SQL & Web Applications (Remote - Mexico Only)"
    );
  });
});
