import { describe, it, expect } from "vitest";
import { parseWorkingNomadsResponse } from "./workingnomads";

describe("parseWorkingNomadsResponse", () => {
  const sampleData = [
    {
      url: "https://www.workingnomads.com/job/go/1864402/",
      title: "Content Reviewer - United States",
      description: "<p>We are looking for an independent reviewer. The rate of pay is $14 per hour.</p>",
      company_name: "TELUS Digital",
      category_name: "Administration",
      tags: "english,social media,quality,communication",
      location: "USA only",
      pub_date: "2026-09-15T10:10:56-04:00",
    },
    {
      url: "https://www.workingnomads.com/job/go/1864403/",
      title: "Senior Product Designer",
      description: "<p>Design intuitive user experiences for our flagship product.</p>",
      company_name: "DesignCo",
      category_name: "Design",
      tags: "figma,ui,ux",
      location: "Worldwide",
      pub_date: "2026-09-16T08:00:00Z",
    },
  ];

  it("parses Working Nomads items correctly", () => {
    const jobs = parseWorkingNomadsResponse(sampleData);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe("TELUS Digital: Content Reviewer - United States");
    expect(jobs[0].url).toBe("https://www.workingnomads.com/job/go/1864402/");
    expect(jobs[0].location).toBe("USA only");
    expect(jobs[0].salary).toBe("$14 per hour");
    expect(jobs[0].tags).toEqual([
      "english",
      "social media",
      "quality",
      "communication",
      "administration",
    ]);
  });

  it("extracts description and strips HTML", () => {
    const jobs = parseWorkingNomadsResponse(sampleData);
    expect(jobs[1].description).toBe("Design intuitive user experiences for our flagship product.");
  });

  it("respects limit argument", () => {
    const jobs = parseWorkingNomadsResponse(sampleData, 1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("TELUS Digital: Content Reviewer - United States");
  });

  it("handles non-array or empty input", () => {
    expect(parseWorkingNomadsResponse(null)).toEqual([]);
    expect(parseWorkingNomadsResponse({})).toEqual([]);
    expect(parseWorkingNomadsResponse([])).toEqual([]);
  });
});
