import * as vscode from "vscode";
import type { CodeSearchResult, ExecutionBundle } from "../types";

export interface ReviewResult {
  bundle: ExecutionBundle;
  included: boolean;
}

async function showSearchResults(
  results: CodeSearchResult[],
): Promise<void> {
  const items = results.map((r) => ({
    label: r.file,
    description: `Lines ${r.lines}`,
    detail: r.code.length > 200 ? r.code.slice(0, 200) + "…" : r.code,
    result: r,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${results.length} code reference(s) found — select to open, press Escape when done`,
    ignoreFocusOut: true,
  });

  if (picked && vscode.workspace.workspaceFolders?.[0]) {
    const uri = vscode.Uri.joinPath(
      vscode.workspace.workspaceFolders[0].uri,
      picked.result.file,
    );
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const startLine = parseInt(picked.result.lines.split("-")[0]!, 10) || 1;
      const line = Math.max(0, startLine - 1);
      await vscode.window.showTextDocument(doc, {
        selection: new vscode.Range(line, 0, line, 0),
        preview: true,
      });
    } catch {
      // file may not exist locally
    }
  }
}

async function adjustTasks(bundle: ExecutionBundle): Promise<ExecutionBundle> {
  if (bundle.tasks.length < 2) return bundle;

  const items = bundle.tasks.map((t) => ({
    label: t.title,
    detail: t.description,
    picked: true,
    taskId: t.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Deselect tasks to exclude from this bundle",
    ignoreFocusOut: true,
  });

  if (!selected || selected.length === bundle.tasks.length) return bundle;
  if (selected.length === 0) return bundle;

  const keepIds = new Set(selected.map((s) => s.taskId));

  return {
    ...bundle,
    tasks: bundle.tasks.filter((t) => keepIds.has(t.id)),
    dependencies: bundle.dependencies?.filter(
      (d) => keepIds.has(d.taskId) && keepIds.has(d.dependsOn),
    ),
  };
}

export async function reviewNewBundle(
  bundle: ExecutionBundle,
): Promise<ReviewResult> {
  const results = bundle.meta?.code_search_results ?? [];

  if (results.length > 0) {
    await showSearchResults(results);
  }

  const adjusted = await adjustTasks(bundle);
  return { bundle: adjusted, included: true };
}
