/**
 * Talent-agency / freelance-marketplace blocklist.
 *
 * These platforms are not direct employers. They aggregate engineers into a
 * talent pool and place them on client projects (contract / hourly / project
 * based), and their region rules commonly exclude the candidate (CET ± 3h,
 * North America only, or a country allow-list that omits China Mainland).
 *
 * Jobs whose company, URL or post body identifies one of these platforms are
 * dropped during crawl ingestion and knowledge-base search, so they are never
 * re-evaluated or re-recommended.
 *
 * Matching is deliberately conservative (exact normalized company match,
 * owned host, URL slug, or an unambiguous content marker) to avoid filtering
 * out direct employers.
 */

import { normalizeCompanyKey } from "./utils.ts";

export interface AgencyPlatform {
  /** Stable CLI key, e.g. `--allow-agency proxify` */
  key: string;
  /** Human-readable name used in logs and reports */
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
 * Detect whether a job belongs to a talent-agency / freelance marketplace.
 * Returns the matched platform and reason, or null for direct employers.
 */
export function detectAgencyPlatform(
  job: {
    company?: string;
    title?: string;
    url?: string;
    content?: string;
  },
  options: AgencyFilterOptions = {}
): AgencyMatch | null {
  const { allow = [], inspectContent = true } = options;
  const allowed = new Set(allow.map((a) => a.trim().toLowerCase()).filter(Boolean));

  const companyKey = normalizeCompanyKey(job.company);
  const host = extractHost(job.url);
  const urlLower = (job.url || "").toLowerCase();
  const contentLower =
    inspectContent && job.content ? job.content.toLowerCase() : "";

  for (const platform of AGENCY_PLATFORMS) {
    if (allowed.has(platform.key) || allowed.has(platform.name.toLowerCase())) continue;

    if (companyKey) {
      for (const name of platform.companyNames) {
        if (companyKey === normalizeCompanyKey(name)) {
          return {
            platform,
            reason: `company "${job.company}" is the ${platform.name} talent marketplace`,
          };
        }
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
