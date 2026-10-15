export interface JobMetadata {
  id: string;
  title: string;
  company: string;
  source: "remoteok" | "weworkremotely" | string;
  url: string;
  posted_at: string;
  crawled_at: string;
  locations: string[];
  salary: string;
  tags: string[];
  status: "active" | "expired";
}

export interface JobMarkdownDocument {
  metadata: JobMetadata;
  markdownContent: string;
}

export type CrawlSource =
  | "all"
  | "remoteok"
  | "weworkremotely"
  | "remotive"
  | "jobspresso"
  | "workingnomads"
  | "nodesk";

export interface CrawlOptions {
  sources?: Array<CrawlSource>;
  limit?: number;
  outDir?: string;
  /** Drop jobs posted by talent-agency / freelance marketplaces (default: true) */
  filterAgencies?: boolean;
  /** Agency platform keys or names to exempt from filtering */
  allowedAgencies?: string[];
}

export interface EvaluatedRecord {
  id?: string;
  url?: string;
  title: string;
  company: string;
  localPath?: string;
  status: "matched" | "rejected";
  reportFile: string;
}

export interface EvaluatedJobIndex {
  urls: Set<string>;
  ids: Set<string>;
  fileNames: Set<string>;
  companyTitleKeys: Set<string>;
  records: EvaluatedRecord[];
}

export interface AgencyFilterStat {
  platform: string;
  title: string;
  company: string;
  url: string;
  reason: string;
}

/**
 * Optional mutable stats accumulator populated by searchJDs so the CLI (and
 * callers) can report how many agency/marketplace jobs were skipped.
 */
export interface SearchStats {
  agencyFiltered: number;
  agencyMatches: AgencyFilterStat[];
}

export interface SearchOptions {
  months?: number; // How many months back to search (default 2)
  tags?: string[];
  keywords?: string[];
  location?: string;
  limit?: number;
  jdsDir?: string;
  matchesDir?: string; // Directory containing match reports (default data/matches)
  excludeMatched?: boolean; // Exclude jobs that have already been evaluated in past reports
  unmatchedOnly?: boolean; // Alias for excludeMatched
  prioritizeUnmatched?: boolean; // Prioritize fresh unmatched jobs ahead of evaluated ones (default true)
  includeMatched?: boolean; // Do not prioritize unmatched jobs, sort purely by date
  filterAgencies?: boolean; // Drop talent-agency / freelance-marketplace jobs (default true)
  allowedAgencies?: string[]; // Agency platform keys or names to exempt from filtering
  inspectAgencyContent?: boolean; // Also scan the JD body for platform markers (default true)
  stats?: SearchStats; // Optional accumulator for filtering counters
}

export interface SearchResultItem {
  id: string;
  title: string;
  company: string;
  source: string;
  url: string;
  posted_at: string;
  locations: string[];
  salary: string;
  tags: string[];
  filePath: string;
  relPath: string;
  scoreMatchReason?: string;
  isEvaluated?: boolean;
  evaluationStatus?: "unmatched" | "matched" | "rejected";
  evaluatedInReport?: string;
}
