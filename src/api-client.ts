import * as vscode from "vscode";
import type {
  ExecutionBundle,
  EvidencePayload,
  SynthesizedContext,
} from "./types";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("orca");
  return {
    apiUrl: (cfg.get<string>("apiUrl") || "http://localhost:3001").replace(
      /\/+$/,
      "",
    ),
    apiToken: cfg.get<string>("apiToken") || "",
  };
}

function headers(token: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { apiUrl, apiToken } = getConfig();
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(apiToken), ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Orca API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<{ status: string }> {
  return request("/health");
}

export async function buildBundle(
  ticketId: string,
  specRef?: string,
): Promise<ExecutionBundle> {
  return request("/v1/bundles", {
    method: "POST",
    body: JSON.stringify({
      ticket_ref: ticketId,
      spec_ref: specRef,
      build_from_ticket: true,
    }),
  });
}

export async function getBundles(
  ticketId: string,
): Promise<{ bundles: ExecutionBundle[] }> {
  return request(
    `/v1/bundles?ticketId=${encodeURIComponent(ticketId)}`,
  );
}

export async function listBundles(
  limit = 50,
  offset = 0,
): Promise<{ bundles: ExecutionBundle[]; total: number }> {
  return request(`/v1/bundles?limit=${limit}&offset=${offset}`);
}

export async function getBundle(id: string): Promise<ExecutionBundle> {
  return request(`/v1/bundles/${encodeURIComponent(id)}`);
}

export async function getContext(
  ticketId: string,
  specRef?: string,
): Promise<SynthesizedContext> {
  return request("/v1/context", {
    method: "POST",
    body: JSON.stringify({ ticket_id: ticketId, spec_ref: specRef }),
  });
}

export async function submitEvidence(
  payload: EvidencePayload,
): Promise<EvidencePayload & { id: string }> {
  return request("/v1/evidence", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
