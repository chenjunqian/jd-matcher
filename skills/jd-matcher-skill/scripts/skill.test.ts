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
  normalizeCompanyKey,
} from "./utils.ts";
import { searchJDs, getTargetMonthDirs } from "./search.ts";
import {
  WWR_RSS_URLS,
  crawlRemotive,
  crawlJobspresso,
  crawlWorkingNomads,
  crawlNoDesk,
  splitAgencyJobs,
} from "./crawl.ts";
import { detectAgencyPlatform } from "./agency_blocklist.ts";
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
          firstSeenAt: "2026-10-10",
          timesEvaluated: 1,
          history: [
            {
              date: "2026-10-10",
              score: 9.2,
              reportFile: "data/matches/2026-10-10-report.md",
            },
          ],
          reportFile: "data/matches/2026-10-10-report.md",
          locations: ["Worldwide"],
          salary: "$120k",
          matchScore: 9.2,
          whyMatch: "Great fit with TypeScript",
          tips: "Highlight Next.js experience",
        },
      ],
      [
        {
          title: "Junior Dev",
          company: "Beta",
          reason: "US Only",
          evaluatedAt: "2026-10-10",
          firstSeenAt: "2026-10-10",
          timesSeen: 1,
          reportFile: "data/matches/2026-10-10-report.md",
        },
      ],
      [],
      [{ date: "2026-10-10", file: "data/matches/2026-10-10-report.md", matched: 1, rejected: 1 }]
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("JD Matcher");
    expect(html).toContain("Senior Full Stack");
    expect(html).toContain("9.2");
    expect(html).toContain("Hard constraint exclusions");
    expect(html).toContain("US Only");
    // Cumulative history UI
    expect(html).toContain("date-section");
    expect(html).toContain("Match report timeline");
    expect(html).toContain("2026-10-10");
    // Frosted workbench shell
    expect(html).toContain('id="spotlightCard"');
    expect(html).toContain('id="activityChart"');
    expect(html).toContain('class="rail"');
  });
});

describe("Cumulative Match History", () => {
  const TEST_MATCHES_DIR = path.resolve(process.cwd(), "data/test_history_matches");

  const buildReport = (date: string, score: number, note: string) => `# Remote Job Match Report
- **Evaluation Date**: ${date}

## 🎯 Top Matches

### 1. [Software Engineer](https://weworkremotely.com/remote-jobs/acme-software-engineer)
- **Company**: Acme
- **Source**: WeWorkRemotely (\`wwr-acme\`)
- **Posted**: 2026-10-01
- **Locations**: Worldwide
- **Salary**: $150,000
- **Match Score**: **${score} / 10**
- **Why Match**:
  - ${note} alignment.
- **Application Tips**:
  - Highlight TypeScript.

## ⛔ Hard Gate Rejections

| Role Title | Company | Rejection Reason |
| :--- | :--- | :--- |
| Junior Dev | Beta | ❌ US Only |
`;

  beforeEach(() => {
    if (fs.existsSync(TEST_MATCHES_DIR)) {
      fs.rmSync(TEST_MATCHES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(TEST_MATCHES_DIR, "archive"), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_MATCHES_DIR)) {
      fs.rmSync(TEST_MATCHES_DIR, { recursive: true, force: true });
    }
  });

  it("recursively collects reports incl. archive/ and same-day suffixed files", async () => {
    const { collectReportFiles, parseAllReports } = await import("./dashboard.ts");

    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "2026-10-15-report.md"),
      buildReport("2026-10-15", 9.5, "new"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "2026-10-15-report-1615.md"),
      buildReport("2026-10-15", 9.4, "second same-day"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "archive", "2026-10-10-report.md"),
      buildReport("2026-10-10", 8.0, "old"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "archive", "sample-report.example.md"),
      buildReport("2000-01-01", 1.0, "example"),
      "utf-8"
    );

    expect(collectReportFiles(TEST_MATCHES_DIR).length).toBe(3);

    const { reports } = parseAllReports(TEST_MATCHES_DIR);
    expect(reports.length).toBe(3);
    expect(reports.every((r) => r.date !== "2000-01-01")).toBe(true);
    expect(reports.filter((r) => r.date === "2026-10-15").length).toBe(2);
  });

  it("keeps the newest evaluation per job and preserves per-report history", async () => {
    const { parseAllReports } = await import("./dashboard.ts");

    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "archive", "2026-10-10-report.md"),
      buildReport("2026-10-10", 8.0, "old"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "2026-10-15-report.md"),
      buildReport("2026-10-15", 9.5, "new"),
      "utf-8"
    );

    const { matches } = parseAllReports(TEST_MATCHES_DIR);
    expect(matches.length).toBe(1);

    const job = matches[0];
    expect(job.matchScore).toBe(9.5);
    expect(job.whyMatch).toContain("new alignment");
    expect(job.evaluatedAt).toBe("2026-10-15");
    expect(job.firstSeenAt).toBe("2026-10-10");
    expect(job.timesEvaluated).toBe(2);
    expect(job.history.length).toBe(2);
    expect(job.history[0].date).toBe("2026-10-15");
    expect(job.reportFile.endsWith("2026-10-15-report.md")).toBe(true);
    // Stable id across runs
    expect(job.id).toMatch(/^job-[a-z0-9]+$/);
  });

  it("merges the same job cross-posted under different URLs", async () => {
    const { parseAllReports } = await import("./dashboard.ts");

    const mk = (date: string, url: string, score: number) => `# Report
- **Evaluation Date**: ${date}

## 🎯 Top Matches

### 1. [Software Engineer](${url})
- **Company**: Acme
- **Source**: RemoteOK
- **Posted**: 2026-10-01
- **Locations**: Worldwide
- **Salary**: $150,000
- **Match Score**: **${score} / 10**
- **Why Match**:
  - fit.
- **Application Tips**:
  - tips.
`;

    // Same company + title, but different URLs (aggregator mirror vs. own careers page)
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "archive", "2026-10-10-report.md"),
      mk("2026-10-10", "https://remoteok.com/remote-jobs/remote-acme-1", 8.5),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "2026-10-15-report.md"),
      mk("2026-10-15", "https://www.acme.com/careers/software-engineer", 9.1),
      "utf-8"
    );

    const { matches } = parseAllReports(TEST_MATCHES_DIR);
    expect(matches.length).toBe(1);
    expect(matches[0].url).toBe("https://www.acme.com/careers/software-engineer");
    expect(matches[0].matchScore).toBe(9.1);
    expect(matches[0].timesEvaluated).toBe(2);
    expect(matches[0].evaluatedAt).toBe("2026-10-15");
    expect(matches[0].firstSeenAt).toBe("2026-10-10");
  });

  it("lets the newest evaluation decide matched vs rejected", async () => {
    const { parseAllReports } = await import("./dashboard.ts");

    // Matched on 10-10, then vetoed as US-only on 10-15
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "archive", "2026-10-10-report.md"),
      buildReport("2026-10-10", 9.0, "old"),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "2026-10-15-report.md"),
      `# Report\n- **Evaluation Date**: 2026-10-15\n\n## ⛔ Hard Gate Rejections\n\n| Role Title | Company | Rejection Reason |\n| :--- | :--- | :--- |\n| Software Engineer | Acme | ❌ US Only |\n`,
      "utf-8"
    );

    const { matches, rejections } = parseAllReports(TEST_MATCHES_DIR);
    expect(matches.some((m) => m.company === "Acme")).toBe(false);
    expect(rejections.some((r) => r.company === "Acme" && r.reason.includes("US Only"))).toBe(true);
  });

  it("formats the bundle timestamp in local time", async () => {
    const { formatLocalDate } = await import("./dashboard.ts");
    const d = new Date(2026, 9, 5, 0, 30); // local Oct 5 00:30
    expect(formatLocalDate(d)).toBe("2026-10-05");
  });
});

describe("Evaluated Job Exclusion & Prioritization", () => {
  const TEST_MATCHES_DIR = path.resolve(process.cwd(), "data/test_matches");

  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(TEST_MATCHES_DIR)) {
      fs.rmSync(TEST_MATCHES_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_MATCHES_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(TEST_MATCHES_DIR)) {
      fs.rmSync(TEST_MATCHES_DIR, { recursive: true, force: true });
    }
  });

  it("builds evaluated index and detects matches/rejections accurately", async () => {
    const { buildEvaluatedJobIndex, checkJobEvaluated } = await import("./utils.ts");

    const sampleReport = `
# Match Report
## Top Matches
### 1. [Staff Go Engineer](https://remoteok.com/job/123)
- Company: SuperCorp
- Source: RemoteOK (\`rok-123\`)
- Local File: \`data/jds/2026/10/rok-123-supercorp-staff-go.md\`
- Match Score: 9.5

## Hard Gate Rejections
| Title | Company | Reason |
|---|---|---|
| Junior Java Dev | OldBank | ❌ Compensation floor |
`;

    fs.writeFileSync(path.join(TEST_MATCHES_DIR, "2026-10-10-report.md"), sampleReport, "utf-8");

    const index = buildEvaluatedJobIndex(TEST_MATCHES_DIR);

    // Test matched job detection by ID
    const matchCheck = checkJobEvaluated({ id: "rok-123", title: "Staff Go Engineer", company: "SuperCorp" }, index);
    expect(matchCheck.evaluated).toBe(true);
    expect(matchCheck.status).toBe("matched");

    // Test rejection detection by Company + Title
    const rejCheck = checkJobEvaluated({ title: "Junior Java Dev", company: "OldBank" }, index);
    expect(rejCheck.evaluated).toBe(true);
    expect(rejCheck.status).toBe("rejected");

    // Test fresh/unmatched job
    const freshCheck = checkJobEvaluated({ id: "fresh-999", title: "Elixir Hacker", company: "NewCo" }, index);
    expect(freshCheck.evaluated).toBe(false);
  });

  it("excludes already evaluated jobs when excludeMatched is true", () => {
    const docEvaluated: JobMarkdownDocument = {
      metadata: {
        id: "eval-001",
        title: "Senior Go Developer",
        company: "Sticker Mule",
        source: "remoteok",
        url: "https://remoteok.com/eval-001",
        posted_at: "2026-10-10T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Worldwide"],
        salary: "$150k",
        tags: ["go", "backend"],
        status: "active",
      },
      markdownContent: "Go developer",
    };

    const docFresh: JobMarkdownDocument = {
      metadata: {
        id: "fresh-002",
        title: "Senior TypeScript Engineer",
        company: "NewStartup",
        source: "remoteok",
        url: "https://remoteok.com/fresh-002",
        posted_at: "2026-10-09T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Worldwide"],
        salary: "$140k",
        tags: ["typescript"],
        status: "active",
      },
      markdownContent: "TypeScript engineer",
    };

    saveJobDocument(docEvaluated, TEST_DIR);
    saveJobDocument(docFresh, TEST_DIR);

    // Write a report marking eval-001 as evaluated
    fs.writeFileSync(
      path.join(TEST_MATCHES_DIR, "report.md"),
      `### 1. [Senior Go Developer](https://remoteok.com/eval-001)\n- Company: Sticker Mule\n- Source: RemoteOK (\`eval-001\`)`,
      "utf-8"
    );

    // 1. With excludeMatched: true
    const excludedResults = searchJDs({
      jdsDir: TEST_DIR,
      matchesDir: TEST_MATCHES_DIR,
      months: 2,
      excludeMatched: true,
    });
    expect(excludedResults.length).toBe(1);
    expect(excludedResults[0].id).toBe("fresh-002");
    expect(excludedResults[0].isEvaluated).toBe(false);

    // 2. Default prioritization puts fresh job first even though evaluated job was posted later
    const prioritizedResults = searchJDs({
      jdsDir: TEST_DIR,
      matchesDir: TEST_MATCHES_DIR,
      months: 2,
      prioritizeUnmatched: true,
    });
    expect(prioritizedResults.length).toBe(2);
    expect(prioritizedResults[0].id).toBe("fresh-002"); // Fresh first
    expect(prioritizedResults[0].isEvaluated).toBe(false);
    expect(prioritizedResults[1].id).toBe("eval-001");
    expect(prioritizedResults[1].isEvaluated).toBe(true);
  });
});

describe("Skill Crawlers", () => {
  it("includes all job categories in WeWorkRemotely feeds", () => {
    expect(WWR_RSS_URLS.length).toBeGreaterThanOrEqual(7);
    expect(WWR_RSS_URLS).toContain("https://weworkremotely.com/categories/remote-customer-support-jobs.rss");
    expect(WWR_RSS_URLS).toContain("https://weworkremotely.com/categories/remote-design-jobs.rss");
    expect(WWR_RSS_URLS).toContain("https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss");
    expect(WWR_RSS_URLS).toContain("https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss");
    expect(WWR_RSS_URLS).toContain("https://weworkremotely.com/categories/remote-product-jobs.rss");
  });

  it("exports all 4 new crawler functions", () => {
    expect(typeof crawlRemotive).toBe("function");
    expect(typeof crawlJobspresso).toBe("function");
    expect(typeof crawlWorkingNomads).toBe("function");
    expect(typeof crawlNoDesk).toBe("function");
  });
});

describe("Agency / Freelance-Marketplace Filtering", () => {
  const AGENCY_JDS_DIR = path.resolve(process.cwd(), "data/test_agency_jds");
  const AGENCY_MATCHES_DIR = path.resolve(process.cwd(), "data/test_agency_matches");

  beforeEach(() => {
    if (fs.existsSync(AGENCY_JDS_DIR)) fs.rmSync(AGENCY_JDS_DIR, { recursive: true, force: true });
    if (fs.existsSync(AGENCY_MATCHES_DIR)) fs.rmSync(AGENCY_MATCHES_DIR, { recursive: true, force: true });
    fs.mkdirSync(AGENCY_JDS_DIR, { recursive: true });
    fs.mkdirSync(AGENCY_MATCHES_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(AGENCY_JDS_DIR)) fs.rmSync(AGENCY_JDS_DIR, { recursive: true, force: true });
    if (fs.existsSync(AGENCY_MATCHES_DIR)) fs.rmSync(AGENCY_MATCHES_DIR, { recursive: true, force: true });
  });

  it("normalizes legal-entity suffixes out of company names", () => {
    expect(normalizeCompanyKey("Proxify AB")).toBe("proxify");
    expect(normalizeCompanyKey("Acme, Inc.")).toBe("acme");
    expect(normalizeCompanyKey("Globex GmbH")).toBe("globex");
    expect(normalizeCompanyKey("Sticker Mule")).toBe("sticker mule");
    expect(normalizeCompanyKey("Lemon.io (Working Nomads)")).toBe("lemon io");
    expect(normalizeCompanyKey("Toptal (WeWorkRemotely)")).toBe("toptal");
    expect(normalizeCompanyKey("Inc")).toBe("inc");
    expect(normalizeCompanyKey("")).toBe("");
  });

  it("detects agency platforms by company, host, URL slug and body markers", () => {
    expect(detectAgencyPlatform({ company: "Proxify AB" })?.platform.key).toBe("proxify");
    expect(detectAgencyPlatform({ company: "Lemon.io" })?.platform.key).toBe("lemon-io");
    expect(detectAgencyPlatform({ company: "Toptal" })?.platform.key).toBe("toptal");

    expect(
      detectAgencyPlatform({ url: "https://www.toptal.com/developers/job/1" })?.platform.key
    ).toBe("toptal");
    expect(
      detectAgencyPlatform({
        company: "Unknown",
        url: "https://weworkremotely.com/remote-jobs/lemon-io-senior-react-full-stack-developer",
      })?.platform.key
    ).toBe("lemon-io");
    expect(
      detectAgencyPlatform({
        company: "Somnio Software",
        content: "Deazy factura al cliente final a su propia tarifa",
      })?.platform.key
    ).toBe("deazy");

    // Legitimate direct employers must never be filtered
    expect(detectAgencyPlatform({ company: "Vercel" })).toBeNull();
    expect(detectAgencyPlatform({ company: "EPAM Systems" })).toBeNull();
    expect(detectAgencyPlatform({ company: "Turing Labs" })).toBeNull();
    expect(
      detectAgencyPlatform({ company: "Arc", url: "https://remoteok.com/remote-jobs/remote-arc-1" })
    ).toBeNull();
  });

  it("exempts platforms passed via allow", () => {
    expect(detectAgencyPlatform({ company: "Proxify" }, { allow: ["proxify"] })).toBeNull();
    expect(detectAgencyPlatform({ company: "Proxify" }, { allow: ["Proxify"] })).toBeNull();
    expect(detectAgencyPlatform({ company: "Toptal" }, { allow: ["proxify"] })?.platform.key).toBe(
      "toptal"
    );
  });

  it("splitAgencyJobs separates direct employers from agency postings", () => {
    const agencyDoc: JobMarkdownDocument = {
      metadata: {
        id: "wn-1",
        title: "Senior Backend Developer (Node.js / Nest.js)",
        company: "Proxify",
        source: "workingnomads",
        url: "https://www.workingnomads.com/job/go/1925654/",
        posted_at: "2026-10-08T00:00:00Z",
        crawled_at: "2026-10-15T00:00:00Z",
        locations: ["Time zone: CET (+/- 3 hours)"],
        salary: "",
        tags: ["nodejs"],
        status: "active",
      },
      markdownContent: "We are Proxify, a global network of developers.",
    };
    const directDoc: JobMarkdownDocument = {
      metadata: {
        id: "wwr-epam",
        title: "Lead Cloud Engineer",
        company: "EPAM Systems",
        source: "weworkremotely",
        url: "https://weworkremotely.com/remote-jobs/epam-systems-lead-cloud-engineer",
        posted_at: "2026-09-30T00:00:00Z",
        crawled_at: "2026-10-15T00:00:00Z",
        locations: ["Anywhere in the World"],
        salary: "",
        tags: ["cloud"],
        status: "active",
      },
      markdownContent: "Azure and Kubernetes platform engineering.",
    };

    const split = splitAgencyJobs([agencyDoc, directDoc]);
    expect(split.filtered).toHaveLength(1);
    expect(split.filtered[0].match.platform.key).toBe("proxify");
    expect(split.jobs.map((d) => d.metadata.id)).toEqual(["wwr-epam"]);

    // Disabling the filter keeps everything
    const unfiltered = splitAgencyJobs([agencyDoc, directDoc], { filterAgencies: false });
    expect(unfiltered.filtered).toHaveLength(0);
    expect(unfiltered.jobs).toHaveLength(2);
  });

  it("drops agency jobs during search by default and reports them in stats", () => {
    const makeDoc = (
      id: string,
      company: string,
      url: string,
      content = ""
    ): JobMarkdownDocument => ({
      metadata: {
        id,
        title: "Senior Backend Engineer",
        company,
        source: "remoteok",
        url,
        posted_at: "2026-10-08T00:00:00Z",
        crawled_at: "2026-10-10T00:00:00Z",
        locations: ["Worldwide"],
        salary: "",
        tags: ["backend"],
        status: "active",
      },
      markdownContent: content || `# Senior Backend Engineer - ${company}`,
    });

    saveJobDocument(makeDoc("agency-1", "Proxify", "https://example.com/proxify-1"), AGENCY_JDS_DIR);
    saveJobDocument(
      makeDoc("agency-2", "Toptal", "https://weworkremotely.com/remote-jobs/toptal-backend-engineer"),
      AGENCY_JDS_DIR
    );
    saveJobDocument(makeDoc("direct-1", "Doximity", "https://example.com/doximity-1"), AGENCY_JDS_DIR);

    const stats = { agencyFiltered: 0, agencyMatches: [] as any[] };
    const filtered = searchJDs({
      jdsDir: AGENCY_JDS_DIR,
      matchesDir: AGENCY_MATCHES_DIR,
      months: 2,
      stats,
    });
    expect(filtered.map((r) => r.id)).toEqual(["direct-1"]);
    expect(stats.agencyFiltered).toBe(2);
    expect(stats.agencyMatches.map((m) => m.platform).sort()).toEqual(["Proxify", "Toptal"]);

    // Opting out returns them again
    const included = searchJDs({
      jdsDir: AGENCY_JDS_DIR,
      matchesDir: AGENCY_MATCHES_DIR,
      months: 2,
      filterAgencies: false,
    });
    expect(included).toHaveLength(3);

    // Exempting a single platform keeps only that one
    const allowed = searchJDs({
      jdsDir: AGENCY_JDS_DIR,
      matchesDir: AGENCY_MATCHES_DIR,
      months: 2,
      allowedAgencies: ["proxify"],
    });
    expect(allowed.map((r) => r.id).sort()).toEqual(["agency-1", "direct-1"]);
  });

  it("parses bundled rejection rows into per-job evaluated records", async () => {
    const { buildEvaluatedJobIndex, checkJobEvaluated, splitMultiValue } = await import("./utils.ts");

    expect(splitMultiValue("Senior Vue Developer / Senior back-end Engineer")).toEqual([
      "Senior Vue Developer",
      "Senior back-end Engineer",
    ]);
    // Parenthesised slashes are not separators
    expect(splitMultiValue("Senior Fullstack Developer (React.js / Node.js)")).toEqual([
      "Senior Fullstack Developer (React.js / Node.js)",
    ]);
    expect(splitMultiValue("Machine Learning Engineer - IV (Fraud / CV) + ML Engineer")).toEqual([
      "Machine Learning Engineer - IV (Fraud / CV) + ML Engineer",
    ]);

    fs.writeFileSync(
      path.join(AGENCY_MATCHES_DIR, "2026-10-15-report-2136.md"),
      [
        "## ❌ Hard Gate Rejections",
        "| Title | Company | Reason |",
        "|---|---|---|",
        "| Senior Vue Developer / Senior back-end Engineer / Head of Engineering | Lemon.io (Working Nomads) | ❌ marketplace + region |",
      ].join("\n"),
      "utf-8"
    );

    const index = buildEvaluatedJobIndex(AGENCY_MATCHES_DIR);
    for (const title of ["Senior Vue Developer", "Senior back-end Engineer", "Head of Engineering"]) {
      const check = checkJobEvaluated({ title, company: "Lemon.io" }, index);
      expect(check.evaluated, `${title} should be evaluated`).toBe(true);
      expect(check.status).toBe("rejected");
    }
  });

  it("treats suffixed agency company names as already evaluated", async () => {
    const { buildEvaluatedJobIndex, checkJobEvaluated } = await import("./utils.ts");

    fs.writeFileSync(
      path.join(AGENCY_MATCHES_DIR, "2026-10-15-report.md"),
      [
        "## ❌ Hard Gate Rejections",
        "| Title | Company | Reason |",
        "|---|---|---|",
        "| Senior Backend Developer (Node.js / Nest.js) | Proxify AB | ❌ CET ±3h + contract marketplace |",
      ].join("\n"),
      "utf-8"
    );

    const index = buildEvaluatedJobIndex(AGENCY_MATCHES_DIR);
    const check = checkJobEvaluated(
      { title: "Senior Backend Developer (Node.js / Nest.js)", company: "Proxify" },
      index
    );
    expect(check.evaluated).toBe(true);
    expect(check.status).toBe("rejected");
  });
});

