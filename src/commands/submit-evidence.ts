import * as vscode from "vscode";
import * as api from "../api-client";
import type { BundleTreeProvider, TreeNode } from "../views/bundle-tree";
import type { EvidencePayload, ExecutionBundle } from "../types";

async function getGitInfo(): Promise<{
  repo: string;
  branch?: string;
  commitSha?: string;
}> {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) {
    return { repo: "unknown" };
  }

  const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
  const gitApi = git.getAPI(1);
  const repo = gitApi.repositories[0];
  if (!repo) {
    return { repo: "unknown" };
  }

  const remotes = repo.state.remotes;
  const origin = remotes.find(
    (r: { name: string }) => r.name === "origin",
  );
  const repoUrl = origin?.fetchUrl ?? origin?.pushUrl ?? "unknown";

  const repoName = repoUrl
    .replace(/\.git$/, "")
    .replace(/^.*[:/]([^/]+\/[^/]+)$/, "$1");

  return {
    repo: repoName,
    branch: repo.state.HEAD?.name,
    commitSha: repo.state.HEAD?.commit,
  };
}

async function pickBundle(
  tree: BundleTreeProvider,
  node?: TreeNode,
): Promise<ExecutionBundle | null> {
  if (node?.bundleId) {
    return tree.getBundle(node.bundleId);
  }

  const entries = tree.getAllEntries();
  if (entries.length === 0) {
    vscode.window.showWarningMessage(
      "No bundles loaded. Fetch a bundle first to submit evidence.",
    );
    return null;
  }

  if (entries.length === 1) {
    return entries[0]!.bundle;
  }

  const picked = await vscode.window.showQuickPick(
    entries.map((e) => ({
      label: e.bundle.ticket_ref,
      description: `v${e.bundle.version} — ${e.bundle.tasks.length} task(s)`,
      bundle: e.bundle,
    })),
    { placeHolder: "Select a bundle to submit evidence for" },
  );

  return picked?.bundle ?? null;
}

export function createSubmitEvidenceCommand(tree: BundleTreeProvider) {
  return async (node?: TreeNode) => {
    const bundle = await pickBundle(tree, node);
    if (!bundle) return;

    const passStr = await vscode.window.showInputBox({
      prompt: "Number of passing tests",
      placeHolder: "0",
      validateInput: (v) =>
        /^\d+$/.test(v) ? null : "Enter a non-negative integer",
    });
    if (passStr === undefined) {
      return;
    }

    const failStr = await vscode.window.showInputBox({
      prompt: "Number of failing tests",
      placeHolder: "0",
      validateInput: (v) =>
        /^\d+$/.test(v) ? null : "Enter a non-negative integer",
    });
    if (failStr === undefined) {
      return;
    }

    const skipStr = await vscode.window.showInputBox({
      prompt: "Number of skipped tests (optional)",
      placeHolder: "0",
    });

    const pass = parseInt(passStr, 10);
    const fail = parseInt(failStr, 10);
    const skip = skipStr ? parseInt(skipStr, 10) : 0;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Submitting evidence...",
        cancellable: false,
      },
      async () => {
        try {
          const gitInfo = await getGitInfo();

          const payload: EvidencePayload = {
            repo: gitInfo.repo,
            branch: gitInfo.branch,
            commit_sha: gitInfo.commitSha,
            ticket_id: bundle.ticket_ref,
            test_results: { pass, fail, skip },
            ci_status: fail > 0 ? "failure" : "success",
            timestamp: new Date().toISOString(),
            lifecycle: "created",
            bundle_id: bundle.id,
            bundle_version: bundle.version,
          };

          const result = await api.submitEvidence(payload);
          vscode.window.showInformationMessage(
            `Evidence submitted (${pass} pass, ${fail} fail, ${skip} skip) — id: ${result.id}`,
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Failed to submit evidence: ${msg}`,
          );
        }
      },
    );
  };
}
