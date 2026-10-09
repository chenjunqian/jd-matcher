import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  slugify,
  parseDateParts,
  cleanHtmlToMarkdown,
  serializeMarkdownDocument,
  parseFrontmatter,
  saveJobDocument,
} from "./utils.ts";
import { searchJDs, getTargetMonthDirs } from "./search.ts";
import type { JobMarkdownDocument } from "./types.ts";

const TEST_DIR = path.resolve(process.cwd(), "data/test_jds");

describe("Skill Utils", () => {
  it("slugifies text cleanly", () => {
    expect(slugify("Senior Full Stack Engineer! @ Acme, Inc.")).toBe(
      "senior-full-stack-engineer-acme-inc"
    );
    expect(slugify("   ---hello   world---  ")).toBe("hello-world");
  });

  it("parses year and month from dates", () => {
    expect(parseDateParts("2026-10-09T13:00:00Z")).toEqual({
      year: "2026",
      month: "10",
    });
    expect(parseDateParts("Mon, 08 Sep 2026 12:00:00 GMT")).toEqual({
      year: "2026",
      month: "09",
    });
  });

  it("converts HTML to clean Markdown", () => {
    const html = `
      <h2>About the Job</h2>
      <p>We are hiring a <strong>Senior Engineer</strong>.</p>
      <ul>
        <li>TypeScript & React</li>
        <li>Node.js backend</li>
      </ul>
      <a href="https://example.com/apply">Apply here</a>
    `;
    const md = cleanHtmlToMarkdown(html);
    expect(md).toContain("## About the Job");
    expect(md).toContain("- TypeScript & React");
    expect(md).toContain("[Apply here](https://example.com/apply)");
    expect(md).not.toContain("<h2>");
    expect(md).not.toContain("<ul>");
  });

  it("serializes and parses Frontmatter losslessly", () => {
    const doc: JobMarkdownDocument = {
      metadata: {
        id: "test-001",
        title: "Staff Engineer",
        company: "TestCorp",
        source: "remoteok",
        url: "https://example.com/job/1",
        posted_at: "2026-10-01T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Worldwide"],
        salary: "$150k - $200k",
        tags: ["typescript", "react"],
        status: "active",
      },
      markdownContent: "## Overview\n\nGreat job opening.",
    };

    const serialized = serializeMarkdownDocument(doc);
    expect(serialized).toContain('id: "test-001"');
    expect(serialized).toContain('tags: ["typescript", "react"]');

    const parsed = parseFrontmatter(serialized);
    expect(parsed.metadata.id).toBe("test-001");
    expect(parsed.metadata.title).toBe("Staff Engineer");
    expect(parsed.metadata.tags).toEqual(["typescript", "react"]);
    expect(parsed.body).toContain("## Overview");
  });
});

describe("Knowledge Base Storage & Search", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("saves document to partitioned path and prevents duplicate overwrite", () => {
    const doc: JobMarkdownDocument = {
      metadata: {
        id: "rok-9999",
        title: "Backend Engineer",
        company: "Acme",
        source: "remoteok",
        url: "https://example.com",
        posted_at: "2026-10-05T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Remote"],
        salary: "",
        tags: ["golang", "postgres"],
        status: "active",
      },
      markdownContent: "## Details\n\nWork with Go.",
    };

    const first = saveJobDocument(doc, TEST_DIR);
    expect(first.saved).toBe(true);
    expect(first.filePath).toContain("2026/10/rok-9999");
    expect(fs.existsSync(first.filePath)).toBe(true);

    const second = saveJobDocument(doc, TEST_DIR);
    expect(second.saved).toBe(false);
    expect(second.reason).toBe("already_exists");
  });

  it("filters jobs by months, tags, and keywords", () => {
    const doc1: JobMarkdownDocument = {
      metadata: {
        id: "rok-1001",
        title: "Senior React Developer",
        company: "Alpha",
        source: "remoteok",
        url: "https://example.com/1",
        posted_at: "2026-10-08T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Worldwide"],
        salary: "$100k",
        tags: ["react", "frontend"],
        status: "active",
      },
      markdownContent: "React and UI",
    };

    const doc2: JobMarkdownDocument = {
      metadata: {
        id: "wwr-2002",
        title: "DevOps Engineer",
        company: "Beta",
        source: "weworkremotely",
        url: "https://example.com/2",
        posted_at: "2026-09-15T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Europe Only"],
        salary: "",
        tags: ["kubernetes", "aws"],
        status: "active",
      },
      markdownContent: "Cloud infrastructure",
    };

    saveJobDocument(doc1, TEST_DIR);
    saveJobDocument(doc2, TEST_DIR);

    // Search for react
    const reactResults = searchJDs({
      jdsDir: TEST_DIR,
      months: 2,
      tags: ["react"],
    });
    expect(reactResults.length).toBe(1);
    expect(reactResults[0].id).toBe("rok-1001");

    // Search for devops by keyword
    const devopsResults = searchJDs({
      jdsDir: TEST_DIR,
      months: 2,
      keywords: ["devops"],
    });
    expect(devopsResults.length).toBe(1);
    expect(devopsResults[0].id).toBe("wwr-2002");
  });
});

describe("Dashboard Generation", () => {
  it("generates valid HTML with metric cards and job items", async () => {
    const { generateDashboardHtml } = await import("./dashboard.ts");
    const html = generateDashboardHtml(
      [
        {
          id: "job-1",
          title: "Senior Full Stack",
          company: "Acme",
          source: "RemoteOK",
          url: "https://example.com/job",
          postedAt: "2026-10-09",
          evaluatedAt: "2026-10-10",
          locations: ["Worldwide"],
          salary: "$120k",
          matchScore: 9.2,
          whyMatch: "Great fit with TypeScript",
          tips: "Highlight Next.js experience",
        },
      ],
      [{ title: "Junior Dev", company: "Beta", reason: "US Only" }]
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("JD Matcher");
    expect(html).toContain("Senior Full Stack");
    expect(html).toContain("9.2");
    expect(html).toContain("Hard Constraint Exclusions");
    expect(html).toContain("US Only");
  });
});

