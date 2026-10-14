import { describe, it, expect } from "vitest";
import { parseRemotiveResponse } from "./remotive";

describe("parseRemotiveResponse", () => {
  const sampleData = {
    "job-count": 2,
    jobs: [
      {
        id: 101,
        url: "https://remotive.com/remote-jobs/support/customer-success-lead-101",
        title: "Customer Success Lead",
        company_name: "Acme Corp",
        category: "Customer Service",
        tags: ["support", "zendesk", "intercom"],
        job_type: "full_time",
        publication_date: "2026-10-10T12:00:00",
        candidate_required_location: "Worldwide",
        salary: "$60,000 - $80,000 USD",
        description: "<p>We are looking for a <strong>Customer Success Lead</strong> to help our global customers.</p>",
      },
      {
        id: 102,
        url: "https://remotive.com/remote-jobs/marketing/growth-marketer-102",
        title: "Growth Marketer",
        company_name: "Beta Inc",
        category: "Marketing",
        tags: ["seo", "analytics"],
        job_type: "contract",
        publication_date: "2026-10-11T09:30:00",
        candidate_required_location: "Europe",
        salary: "",
        description: "<p>Help scale our marketing efforts across organic channels.</p>",
      },
    ],
  };

  it("parses all jobs correctly", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs).toHaveLength(2);
  });

  it("formats title with company prefix", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs[0].title).toBe("Acme Corp: Customer Success Lead");
    expect(jobs[1].title).toBe("Beta Inc: Growth Marketer");
  });

  it("extracts URL and location", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs[0].url).toBe("https://remotive.com/remote-jobs/support/customer-success-lead-101");
    expect(jobs[0].location).toBe("Worldwide");
    expect(jobs[1].location).toBe("Europe");
  });

  it("extracts salary when provided", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs[0].salary).toBe("$60,000 - $80,000 USD");
    expect(jobs[1].salary).toBe("");
  });

  it("strips HTML from description", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs[0].description).toBe("We are looking for a Customer Success Lead to help our global customers.");
    expect(jobs[0].description).not.toContain("<p>");
  });

  it("combines tags with category and job type", () => {
    const jobs = parseRemotiveResponse(sampleData);
    expect(jobs[0].tags).toContain("support");
    expect(jobs[0].tags).toContain("customer service");
    expect(jobs[0].tags).toContain("full time");
  });

  it("respects limit parameter", () => {
    const jobs = parseRemotiveResponse(sampleData, 1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Acme Corp: Customer Success Lead");
  });

  it("handles empty or invalid data gracefully", () => {
    expect(parseRemotiveResponse(null)).toEqual([]);
    expect(parseRemotiveResponse({})).toEqual([]);
    expect(parseRemotiveResponse({ jobs: [] })).toEqual([]);
  });
});
