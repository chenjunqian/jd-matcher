/**
 * Talent-agency / freelance-marketplace blocklist.
 *
 * Ported from `skills/jd-matcher-skill/scripts/agency_blocklist.ts` so the
 * Worker applies the exact same filter as the local-first skill. Keep both
 * lists in sync: agency platforms are not direct employers — they pool
 * engineers into a talent network and place them on client projects (contract /
 * hourly / project based), and their region rules commonly exclude the
 * candidate (CET ± 3h, North America only, or a country allow-list that omits
 * China Mainland).
 *
 * Agency job postings are dropped during crawl ingestion (never written into
 * `job_detail`) and skipped during match generation (never sent to the AI
 * agent), so they are never evaluated or recommended.
 *
 * Matching is deliberately conservative (exact normalized company match, owned
 * host, URL slug, or an unambiguous content marker) to avoid filtering out
 * direct employers.
 */

import type { CommonJob, JobDetail } from "../types.js";

export interface AgencyPlatform {
  /** Stable key, e.g. `allow: ["proxify"]` */
  key: string;
  /** Human-readable name used in logs */
  name: string;
  /** Exact normalized company names that identify the platform */
  companyNames: string[];
  /** Hostnames owned by the platform (also matches subdomains) */
  hosts?: string[];
  /** URL slug fragments used by aggregators (e.g. weworkremotely.com/remote-jobs/<slug>-...) */
  urlSlugs?: string[];
  /** Unambiguous phrases that only appear in platform-managed postings */
  contentMarkers?: string[];
}

export const AGENCY_PLATFORMS: AgencyPlatform[] = [
  {
    key: "proxify",
    name: "Proxify",
    companyNames: ["Proxify", "Proxify AB"],
    hosts: ["proxify.io", "proxify.com"],
    urlSlugs: ["proxify"],
  },
  {
    key: "lemon-io",
    name: "Lemon.io",
    companyNames: ["Lemon.io", "Lemonio"],
    hosts: ["lemon.io"],
    urlSlugs: ["lemon-io", "lemonio"],
  },
  {
    key: "toptal",
    name: "Toptal",
    companyNames: ["Toptal"],
    hosts: ["toptal.com"],
    urlSlugs: ["toptal"],
  },
  {
    key: "a-team",
    name: "A.Team",
    companyNames: ["A.Team", "A Team", "ATeam"],
    hosts: ["a.team"],
    urlSlugs: ["a-team"],
  },
  {
    key: "x-team",
    name: "X-Team",
    companyNames: ["X-Team", "XTeam"],
    hosts: ["x-team.com"],
    urlSlugs: ["x-team"],
  },
  {
    key: "andela",
    name: "Andela",
    companyNames: ["Andela"],
    hosts: ["andela.com"],
    urlSlugs: ["andela"],
  },
  {
    key: "turing",
    name: "Turing",
    companyNames: ["Turing", "Turing.com"],
    hosts: ["turing.com"],
    urlSlugs: ["turing-com", "turing"],
  },
  {
    key: "gun-io",
    name: "Gun.io",
    companyNames: ["Gun.io", "Gunio"],
    hosts: ["gun.io"],
    urlSlugs: ["gun-io", "gunio"],
  },
  {
    key: "braintrust",
    name: "Braintrust",
    companyNames: ["Braintrust", "Braintrust Data"],
    hosts: ["usebraintrust.com", "braintrust.dev"],
    urlSlugs: ["braintrust"],
  },
  {
    key: "arc-dev",
    name: "Arc.dev",
    companyNames: ["Arc.dev", "Arc dev"],
    hosts: ["arc.dev"],
    urlSlugs: ["arc-dev"],
  },
  {
    key: "crossover",
    name: "Crossover",
    companyNames: ["Crossover", "Crossover for Work"],
    hosts: ["crossover.com"],
    urlSlugs: ["crossover"],
  },
  {
    key: "upwork",
    name: "Upwork",
    companyNames: ["Upwork", "Upwork Inc"],
    hosts: ["upwork.com"],
    urlSlugs: ["upwork"],
  },
  {
    key: "freelancer",
    name: "Freelancer.com",
    companyNames: ["Freelancer", "Freelancer.com"],
    hosts: ["freelancer.com"],
    urlSlugs: ["freelancer-com"],
  },
  {
    key: "gigster",
    name: "Gigster",
    companyNames: ["Gigster"],
    hosts: ["gigster.com"],
    urlSlugs: ["gigster"],
  },
  {
    key: "topcoder",
    name: "Topcoder",
    companyNames: ["Topcoder"],
    hosts: ["topcoder.com"],
    urlSlugs: ["topcoder"],
  },
  {
    key: "scalable-path",
    name: "Scalable Path",
    companyNames: ["Scalable Path", "ScalablePath"],
    hosts: ["scalablepath.com"],
    urlSlugs: ["scalable-path", "scalablepath"],
  },
  {
    key: "deazy",
    name: "Deazy",
    companyNames: ["Deazy"],
    hosts: ["deazy.com"],
    urlSlugs: ["deazy"],
    contentMarkers: ["deazy"],
  },
];

export interface AgencyFilterOptions {
  /** Platform keys or names to exempt from filtering (e.g. ["proxify"]) */
  allow?: string[];
  /** Also scan the job body for platform markers (default: true) */
  inspectContent?: boolean;
}

export interface AgencyMatch {
  platform: AgencyPlatform;
  reason: string;
}

/** Fields inspected by the filter, normalized across crawlers and DB rows. */
export interface AgencyJobFields {
  company?: string;
  title?: string;
  /** Job posting URL */
  url?: string;
  /** Full post body (plain text or markdown) */
  content?: string;
}

/** Common legal-entity suffixes that carry no identifying signal. */
const LEGAL_ENTITY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "sa",
  "sas",
  "sarl",
  "srl",
  "spa",
  "plc",
  "pte",
  "pvt",
  "oy",
  "ab",
  "as",
  "aps",
  "kft",
  "doo",
  "dba",
  "sdn",
  "bhd",
]);

/** Normalize a free-form string for key matching. */
export function normalizeKey(text?: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Normalize a company name for comparison: lowercases, strips punctuation,
 * parenthetical annotations and trailing legal-entity suffixes
 * (e.g. "Proxify AB" -> "proxify", "Lemon.io" -> "lemon io").
 */
export function normalizeCompanyKey(text?: string): string {
  const withoutNotes = (text ?? "").replace(/\([^)]*\)/g, " ");
  const key = normalizeKey(withoutNotes);
  if (!key) return "";
  const tokens = key.split(" ");
  while (tokens.length > 1 && LEGAL_ENTITY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** Extract a normalized hostname from a URL, or "" when unparseable. */
function extractHost(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recover the company name from a job title when the source feeds it there:
 *
 * - `<Company>: <Role>` — WeWorkRemotely, Remotive, Working Nomads, Jobspresso
 * - `<Role> at <Company>` — NoDesk
 *
 * Returns `undefined` when no company can be identified (e.g. RemoteOK titles
 * only carry the role); the URL host/slug checks still apply in that case.
 */
export function extractCompanyFromTitle(title?: string): string | undefined {
  const raw = (title ?? "").trim();
  if (!raw) return undefined;

  const colon = raw.indexOf(":");
  if (colon > 0 && colon <= 60) {
    const company = raw.slice(0, colon).trim();
    if (company && company.toLowerCase() !== "remote") return company;
  }

  const at = raw.lastIndexOf(" at ");
  if (at > 0) {
    const company = raw.slice(at + 4).trim();
    if (company) return company;
  }

  return undefined;
}

/**
 * Detect whether a job belongs to a talent-agency / freelance marketplace.
 * Returns the matched platform and reason, or null for direct employers.
 */
export function detectAgencyPlatform(
  job: AgencyJobFields,
  options: AgencyFilterOptions = {}
): AgencyMatch | null {
  const { allow = [], inspectContent = true } = options;
  const allowed = new Set(allow.map((a) => a.trim().toLowerCase()).filter(Boolean));

  const host = extractHost(job.url);
  const urlLower = (job.url || "").toLowerCase();
  const contentLower = inspectContent && job.content ? job.content.toLowerCase() : "";

  // Company candidates: an explicit company plus whatever the title encodes.
  const companyCandidates = [job.company, extractCompanyFromTitle(job.title)]
    .map((c) => normalizeCompanyKey(c))
    .filter((c) => c.length > 0);
  const companyKeys = new Set(companyCandidates);

  for (const platform of AGENCY_PLATFORMS) {
    if (allowed.has(platform.key) || allowed.has(platform.name.toLowerCase())) continue;

    for (const name of platform.companyNames) {
      if (companyKeys.has(normalizeCompanyKey(name))) {
        return {
          platform,
          reason: `company "${job.company ?? extractCompanyFromTitle(job.title)}" is the ${platform.name} talent marketplace`,
        };
      }
    }

    if (host) {
      for (const h of platform.hosts ?? []) {
        if (host === h || host.endsWith(`.${h}`)) {
          return { platform, reason: `URL host ${host} belongs to ${platform.name}` };
        }
      }
    }

    if (urlLower) {
      for (const slug of platform.urlSlugs ?? []) {
        const re = new RegExp(`(^|[/._-])${escapeRegExp(slug)}([/._-]|$)`);
        if (re.test(urlLower)) {
          return { platform, reason: `URL slug "${slug}" identifies ${platform.name}` };
        }
      }
    }

    if (contentLower) {
      for (const marker of platform.contentMarkers ?? []) {
        if (contentLower.includes(marker.toLowerCase())) {
          return {
            platform,
            reason: `post body references ${platform.name} ("${marker}")`,
          };
        }
      }
    }
  }

  return null;
}

/** Detect an agency posting from the normalized fields of a crawled job. */
export function detectAgencyJob(
  job: AgencyJobFields,
  options: AgencyFilterOptions = {}
): AgencyMatch | null {
  return detectAgencyPlatform(job, options);
}

/** Map a crawled job onto the fields inspected by the filter. */
export function commonJobFields(job: CommonJob): AgencyJobFields {
  return { title: job.title, url: job.url, content: job.description };
}

/** Map a stored job row onto the fields inspected by the filter. */
export function jobDetailFields(job: JobDetail): AgencyJobFields {
  return { title: job.title, url: job.link, content: job.jobDesc };
}

/** Detect an agency posting from a stored job row. */
export function isAgencyJobDetail(
  job: JobDetail,
  options: AgencyFilterOptions = {}
): AgencyMatch | null {
  return detectAgencyPlatform(jobDetailFields(job), options);
}

/**
 * Partition jobs into direct-employer jobs and talent-agency / marketplace
 * postings (Proxify, Lemon.io, Toptal, …).
 */
export function filterAgencyJobs<T>(
  items: T[],
  toFields: (item: T) => AgencyJobFields,
  options: AgencyFilterOptions = {}
): { jobs: T[]; filtered: Array<{ job: T; match: AgencyMatch }> } {
  const jobs: T[] = [];
  const filtered: Array<{ job: T; match: AgencyMatch }> = [];

  for (const item of items) {
    const match = detectAgencyPlatform(toFields(item), options);
    if (match) {
      filtered.push({ job: item, match });
    } else {
      jobs.push(item);
    }
  }

  return { jobs, filtered };
}
