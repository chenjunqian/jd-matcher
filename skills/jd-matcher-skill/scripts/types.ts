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

export interface CrawlOptions {
  sources?: Array<"remoteok" | "weworkremotely">;
  limit?: number;
  outDir?: string;
}

export interface SearchOptions {
  months?: number; // How many months back to search (default 2)
  tags?: string[];
  keywords?: string[];
  location?: string;
  limit?: number;
  jdsDir?: string;
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
}
