export interface Frontmatter {
  title: string;
  type: "concept" | "entity" | "source" | "analysis" | "index" | "log";
  created: string;
  updated: string;
  sources?: string[];
  tags?: string[];
  confidence?: "high" | "medium" | "low";
}

export interface WikiPage {
  slug: string;
  filename: string;
  frontmatter: Frontmatter;
  content: string;
  rawContent: string;
}

export interface WikiLink {
  raw: string;
  target: string;
  alias?: string;
  exists: boolean;
}

export interface IngestRequest {
  fileName: string;
  content: string;
  fileType: "article" | "paper" | "note" | "data";
}

export interface IngestResponse {
  success: boolean;
  created: string[];
  updated: string[];
  logEntry: string;
}

export interface QueryRequest {
  question: string;
  currentDocument?: string;
  fileAsPage?: boolean;
}

export interface QueryResponse {
  answer: string;
  citations: string[];
  savedAs?: string;
}

export interface LintIssue {
  type: "contradiction" | "orphan" | "stale" | "missing_crossref" | "missing_page";
  description: string;
  pages: string[];
  suggestion: string;
}

export interface LintResponse {
  issues: LintIssue[];
  autoFixed: number;
}
