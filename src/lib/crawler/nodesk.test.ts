import { describe, it, expect } from "vitest";
import { parseNoDeskRSS } from "./nodesk";

describe("parseNoDeskRSS", () => {
  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Remote Jobs – NoDesk</title>
    <item>
      <title>Technical Customer Support at QuickMail</title>
      <description>We are hiring a technical customer support person with an owner mindset.</description>
      <pubDate>Mon, 12 Oct 2026 08:00:00 +0000</pubDate>
      <guid>https://nodesk.co/remote-jobs/quickmail-technical-customer-support/</guid>
      <link>https://nodesk.co/remote-jobs/quickmail-technical-customer-support/</link>
      <category>Customer Support</category>
    </item>
    <item>
      <title>Staff GTM Analyst (USA Only, 100% Remote) at Close</title>
      <description>Since 2013, we have been building a CRM that gets out of your way.</description>
      <pubDate>Thu, 08 Oct 2026 08:00:00 +0200</pubDate>
      <guid>https://nodesk.co/remote-jobs/close-staff-gtm-analyst/</guid>
      <link>https://nodesk.co/remote-jobs/close-staff-gtm-analyst/</link>
      <category>Sales</category>
      <category>Marketing</category>
    </item>
  </channel>
</rss>`;

  it("parses NoDesk RSS items", () => {
    const jobs = parseNoDeskRSS(sampleRss);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].title).toBe("Technical Customer Support at QuickMail");
    expect(jobs[0].url).toBe("https://nodesk.co/remote-jobs/quickmail-technical-customer-support/");
    expect(jobs[0].location).toBe("Anywhere / Remote");
    expect(jobs[0].description).toBe("We are hiring a technical customer support person with an owner mindset.");
    expect(jobs[0].tags).toEqual(["customer support"]);
    expect(jobs[0].updateTime).toBe("Mon, 12 Oct 2026 08:00:00 +0000");

    expect(jobs[1].title).toBe("Staff GTM Analyst (USA Only, 100% Remote) at Close");
    expect(jobs[1].location).toBe("USA Only, 100% Remote");
    expect(jobs[1].tags).toEqual(["sales", "marketing"]);
  });

  it("handles empty RSS", () => {
    expect(parseNoDeskRSS(`<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`)).toEqual([]);
  });
});
