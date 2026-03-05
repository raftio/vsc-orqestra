import * as vscode from "vscode";
import * as auth from "./auth";
import type {
  ChatMessage,
  Conversation,
  ExecutionBundle,
  EvidencePayload,
  LoginResponse,
  SynthesizedContext,
  Workspace,
} from "./types";

function getApiUrl(): string {
  const cfg = vscode.workspace.getConfiguration("or");
  return (cfg.get<string>("apiUrl") || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const apiUrl = getApiUrl();
  const token = init?.token ?? (await auth.getToken());
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(token), ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OR API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function loginApi(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getHealth(): Promise<{ status: string }> {
  return request("/health");
}

// ── Workspaces ────────────────────────────────────────────────────────────

export async function listWorkspaces(): Promise<{
  workspaces: Workspace[];
}> {
  return request("/v1/workspaces");
}

// ── Bundles (workspace-scoped) ────────────────────────────────────────────

export async function listBundles(
  workspaceId: string,
  limit = 50,
  offset = 0,
): Promise<{ bundles: ExecutionBundle[]; total: number }> {
  return request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/bundles?limit=${limit}&offset=${offset}&status=active`,
  );
}

export async function getBundle(
  workspaceId: string,
  id: string,
): Promise<ExecutionBundle> {
  return request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/bundles/${encodeURIComponent(id)}`,
  );
}

export async function buildBundle(
  workspaceId: string,
  ticketId: string,
  specRef?: string,
): Promise<ExecutionBundle> {
  return request(`/v1/workspaces/${encodeURIComponent(workspaceId)}/bundles`, {
    method: "POST",
    body: JSON.stringify({
      ticket_ref: ticketId,
      spec_ref: specRef,
      build_from_ticket: true,
    }),
  });
}

// ── Context ───────────────────────────────────────────────────────────────

export async function getContext(
  ticketId: string,
  specRef?: string,
): Promise<SynthesizedContext> {
  return request("/v1/context", {
    method: "POST",
    body: JSON.stringify({ ticket_id: ticketId, spec_ref: specRef }),
  });
}

// ── Evidence ──────────────────────────────────────────────────────────────

export async function submitEvidence(
  payload: EvidencePayload,
): Promise<EvidencePayload & { id: string }> {
  return request("/v1/evidence", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Chat ───────────────────────────────────────────────────────────────────

export async function streamChat(
  workspaceId: string,
  messages: ChatMessage[],
  conversationId?: string,
  mode: "agent" | "ask" | "plan" = "ask",
): Promise<Response> {
  const apiUrl = getApiUrl();
  const token = await auth.getToken();
  const url = `${apiUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/chat`;
  return fetch(url, {
    method: "POST",
    headers: headers(token ?? undefined),
    body: JSON.stringify({ messages, conversationId, mode }),
  });
}

export async function listConversations(
  workspaceId: string,
): Promise<{ conversations: Conversation[]; total: number }> {
  return request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/chat/conversations?limit=50`,
  );
}

export async function getConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Array<{ role: string; content: string }> }> {
  return request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/chat/conversations/${encodeURIComponent(conversationId)}`,
  );
}
