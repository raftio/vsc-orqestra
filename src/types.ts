export interface BundleTask {
  id: string;
  title: string;
  description?: string;
}

export interface BundleDependency {
  taskId: string;
  dependsOn: string;
}

export interface CodeSearchResult {
  file: string;
  lines: string;
  language: string | null;
  score: number;
  code: string;
}

export interface ExecutionBundle {
  id: string;
  version: number;
  title?: string;
  spec_ref: string;
  ticket_ref: string;
  tasks: BundleTask[];
  dependencies?: BundleDependency[];
  acceptance_criteria_refs: string[];
  context?: {
    excerpts?: string[];
    related_ticket_ids?: string[];
  };
  meta?: {
    code_search_results?: CodeSearchResult[];
    doc_sections?: Array<{ id: string; title: string; body: string }>;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface TestResults {
  pass: number;
  fail: number;
  skip?: number;
  failed_test_names?: string[];
}

export interface Coverage {
  line_pct?: number;
  branch_pct?: number;
}

export interface EvidencePayload {
  id?: string;
  repo: string;
  branch?: string;
  commit_sha?: string;
  pr_id?: string;
  ticket_id: string;
  test_results: TestResults;
  coverage?: Coverage;
  ci_status: "success" | "failure" | "cancelled";
  timestamp: string;
  lifecycle?: "created" | "validated" | "linked";
  bundle_id?: string;
  bundle_version?: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  role: string;
  member_count: number;
  created_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface SynthesizedContext {
  ticket_id: string;
  ticket_title: string;
  ticket_description: string;
  acceptance_criteria: Array<{ id: string; description: string }>;
  sections?: Array<{ id: string; title: string; body: string }>;
  excerpts?: string[];
  related_ticket_ids?: string[];
}
