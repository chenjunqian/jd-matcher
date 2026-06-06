import { describe, it, expect } from "vitest";
import { parseRemoteOkMainPageJobs } from "./remote_ok";
import * as fs from "fs";
import * as path from "path";

const fixture = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "remoteok_test.html"),
  "utf-8"
);

describe("parseRemoteOkMainPageJobs", () => {
  const jobs = parseRemoteOkMainPageJobs(fixture);

  it("parses all 4 jobs", () => {
    expect(jobs).toHaveLength(4);
  });

  it("parses a job with div.salary and single div.location correctly", () => {
    const job = jobs.find((j) => j.title === "Builder Chief")!;
    expect(job).toBeDefined();
    expect(job.location).toBe("🇺🇸 United States");
    expect(job.salary).toBe("💰 $80k - $120k");
    expect(job.url).toBe("https://remoteok.com/remote-jobs/remote-builder-chief-consultran-1132898");
    expect(job.tags).toEqual(["Developer"]);
    expect(job.updateTime).toBe("2026-06-05T20:03:15+00:00");
  });

  it("separates salary from location and filters employment type", () => {
    const job = jobs.find((j) => j.title === "Senior Software Engineer")!;
    expect(job.location).not.toContain("⏰");
    expect(job.location).toContain("🇪🇺 Europe");
    expect(job.location).toContain("🌎 North America");
    expect(job.salary).toBe("💰 $90k - $130k");
    expect(job.tags).toEqual(["Developer", "Train"]);
  });

  it("filters Part time employment type from location", () => {
    const job = jobs.find((j) => j.title === "Entry Level Junior Trader")!;
    expect(job.location).toBe("🌏 Worldwide");
    expect(job.location).not.toContain("⏰");
    expect(job.salary).toBe("💰 $50k - $60k");
    expect(job.tags).toEqual(["Other", "Finance", "Analyst"]);
  });

  it("falls back to Premium placeholder when no div.salary", () => {
    const job = jobs.find((j) => j.title === "Sourcing Specialist")!;
    expect(job.location).toBe("🌏 Worldwide");
    expect(job.salary).toBe("💰 Upgrade to Premium to see salary");
    expect(job.tags).toEqual(["Sys Admin", "Recruiter", "Medical", "Non Tech"]);
  });

  it("includes job description text", () => {
    for (const job of jobs) {
      expect(job.description.length).toBeGreaterThan(0);
      expect(typeof job.description).toBe("string");
    }
  });
});
