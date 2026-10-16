import { describe, it, expect } from "vitest";
import {
  AGENCY_PLATFORMS,
  commonJobFields,
  detectAgencyJob,
  detectAgencyPlatform,
  extractCompanyFromTitle,
  filterAgencyJobs,
  isAgencyJobDetail,
  normalizeCompanyKey,
} from "./agency_blocklist";
import type { CommonJob, JobDetail } from "../types";

function makeJob(overrides: Partial<CommonJob> = {}): CommonJob {
  return {
    title: "Senior TypeScript Engineer",
    url: "https://example.com/jobs/1",
    description: "We are looking for a senior TypeScript engineer.",
    tags: [],
    location: "Remote",
    salary: "",
    updateTime: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: "job-1",
    title: "Senior TypeScript Engineer",
    jobDesc: "We are looking for a senior TypeScript engineer.",
    jobTags: [],
    link: "https://example.com/jobs/1",
    source: "remoteok",
    location: "Remote",
    salary: "",
    updateTime: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeCompanyKey", () => {
  it("lowercases, strips punctuation, notes and legal suffixes", () => {
    expect(normalizeCompanyKey("Proxify AB")).toBe("proxify");
    expect(normalizeCompanyKey("Lemon.io")).toBe("lemon io");
    expect(normalizeCompanyKey("Lemon.io (Working Nomads)")).toBe("lemon io");
    expect(normalizeCompanyKey("A.Team")).toBe("a team");
  });
});

describe("extractCompanyFromTitle", () => {
  it("reads the company from '<Company>: <Role>' titles", () => {
    expect(extractCompanyFromTitle("Varicent: Support Engineer")).toBe("Varicent");
    expect(extractCompanyFromTitle("Lemon.io: Backend Engineer")).toBe("Lemon.io");
  });

  it("reads the company from '<Role> at <Company>' titles", () => {
    expect(extractCompanyFromTitle("Senior Engineer (Remote) at Proxify")).toBe("Proxify");
  });

  it("returns undefined for role-only titles", () => {
    expect(extractCompanyFromTitle("Senior Software Engineer")).toBeUndefined();
    expect(extractCompanyFromTitle("")).toBeUndefined();
  });
});

describe("detectAgencyPlatform", () => {
  it("matches a normalized company name", () => {
    const match = detectAgencyPlatform({ company: "Proxify AB", title: "Frontend Dev" });
    expect(match?.platform.key).toBe("proxify");
  });

  it("matches a company encoded in the title", () => {
    expect(detectAgencyJob({ title: "Toptal: Senior Backend Engineer" })?.platform.key).toBe("toptal");
    expect(detectAgencyJob({ title: "Backend Engineer at Upwork" })?.platform.key).toBe("upwork");
  });

  it("matches a platform-owned host", () => {
    expect(detectAgencyPlatform({ url: "https://talent.toptal.com/jobs/1" })?.platform.key).toBe("toptal");
  });

  it("matches aggregator URL slugs", () => {
    expect(
      detectAgencyPlatform({
        url: "https://weworkremotely.com/remote-jobs/toptal-backend-engineer",
      })?.platform.key
    ).toBe("toptal");
    expect(
      detectAgencyPlatform({
        url: "https://remoteok.com/remote-jobs/remote-senior-frontend-developer-proxify-1137475",
      })?.platform.key
    ).toBe("proxify");
  });

  it("matches unambiguous body markers", () => {
    const match = detectAgencyPlatform({
      company: "Somnio Software",
      title: "Senior Node Engineer",
      content: "This role is delivered in partnership with deazy.",
    });
    expect(match?.platform.key).toBe("deazy");
  });

  it("skips the body scan when inspectContent is false", () => {
    const job = { company: "Somnio Software", content: "delivered with deazy" };
    expect(detectAgencyPlatform(job, { inspectContent: false })).toBeNull();
  });

  it("honours the allow list", () => {
    expect(detectAgencyJob({ title: "Proxify: Senior Engineer" }, { allow: ["proxify"] })).toBeNull();
    expect(detectAgencyJob({ title: "Proxify: Senior Engineer" }, { allow: ["Proxify"] })).toBeNull();
    expect(detectAgencyJob({ title: "Toptal: Senior Engineer" }, { allow: ["proxify"] })?.platform.key).toBe("toptal");
  });

  it("keeps direct employers", () => {
    expect(
      detectAgencyJob({
        title: "Proxima Labs: Senior Engineer",
        url: "https://example.com/jobs/proxima-labs-1",
        content: "We are a product company hiring directly.",
      })
    ).toBeNull();
  });
});

describe("filterAgencyJobs", () => {
  it("partitions crawled jobs into direct employers and agency postings", () => {
    const direct = makeJob();
    const agency = makeJob({ title: "Proxify: Senior Frontend Developer" });

    const result = filterAgencyJobs([direct, agency], commonJobFields);

    expect(result.jobs).toEqual([direct]);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].job).toEqual(agency);
    expect(result.filtered[0].match.platform.key).toBe("proxify");
  });

  it("supports a custom field mapper (stored job rows)", () => {
    const direct = makeDetail();
    const agency = makeDetail({
      title: "Backend Engineer",
      link: "https://jobs.lemon.io/backend-engineer",
    });

    const result = filterAgencyJobs([direct, agency], (j) => ({
      title: j.title,
      url: j.link,
      content: j.jobDesc,
    }));

    expect(result.jobs).toEqual([direct]);
    expect(result.filtered[0].match.platform.key).toBe("lemon-io");
  });
});

describe("isAgencyJobDetail", () => {
  it("detects agency rows from stored job details", () => {
    expect(isAgencyJobDetail(makeDetail({ title: "Crossover: DevOps Engineer" }))?.platform.key).toBe(
      "crossover"
    );
    expect(isAgencyJobDetail(makeDetail())).toBeNull();
  });
});

describe("AGENCY_PLATFORMS", () => {
  it("has unique keys", () => {
    const keys = AGENCY_PLATFORMS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
