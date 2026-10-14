import { describe, it, expect } from "vitest";
import { parseJobspressoRSS } from "./jobspresso";

describe("parseJobspressoRSS", () => {
  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Jobs – Jobspresso</title>
    <item>
      <title>Remote Financial Services Agent (Independent Contractor)</title>
      <link>https://jobspresso.co/job/shyftoff-support-agent/</link>
      <dc:creator><![CDATA[ShyftOff<br>⚲&nbsp;United States]]></dc:creator>
      <pubDate>Mon, 12 Oct 2026 15:36:31 +0000</pubDate>
      <guid isPermaLink="false">https://jobspresso.co/?p=163442</guid>
      <description><![CDATA[<p>Summary text here.</p>]]></description>
      <content:encoded><![CDATA[<p>Full job description text with <strong>requirements</strong> and details.</p>]]></content:encoded>
      <category><![CDATA[Support]]></category>
      <category><![CDATA[Customer Service]]></category>
    </item>
  </channel>
</rss>`;

  it("parses Jobspresso jobs from RSS", () => {
    const jobs = parseJobspressoRSS(sampleRss);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("ShyftOff: Remote Financial Services Agent (Independent Contractor)");
    expect(jobs[0].url).toBe("https://jobspresso.co/job/shyftoff-support-agent/");
    expect(jobs[0].location).toBe("United States");
    expect(jobs[0].description).toBe("Full job description text with requirements and details.");
    expect(jobs[0].tags).toEqual(["support", "customer service"]);
    expect(jobs[0].updateTime).toBe("Mon, 12 Oct 2026 15:36:31 +0000");
  });

  it("handles empty RSS feed", () => {
    const emptyRss = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    expect(parseJobspressoRSS(emptyRss)).toEqual([]);
  });

  it("handles item with simple creator and description", () => {
    const simpleRss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <item>
      <title>Marketing Specialist</title>
      <link>https://jobspresso.co/job/marketing/</link>
      <dc:creator>AcmeCorp</dc:creator>
      <pubDate>Mon, 12 Oct 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[Marketing role description]]></description>
    </item>
  </channel>
</rss>`;
    const jobs = parseJobspressoRSS(simpleRss);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("AcmeCorp: Marketing Specialist");
    expect(jobs[0].location).toBe("Remote");
    expect(jobs[0].description).toBe("Marketing role description");
  });
});
