import * as vscode from "vscode";
import type { BundleTreeProvider, TreeNode } from "../views/bundle-tree";
import { composeTaskPrompt, composeBundlePrompt } from "../prompt";

function openCursorChat(query: string): Thenable<unknown> {
  return vscode.commands.executeCommand("workbench.action.chat.open", {
    query,
  });
}

export function createExecuteTaskCommand(tree: BundleTreeProvider) {
  return async (nodeOrTaskId?: TreeNode | string) => {
    let bundleId: string | undefined;
    let taskId: string | undefined;

    if (typeof nodeOrTaskId === "string") {
      taskId = nodeOrTaskId;
    } else if (nodeOrTaskId) {
      bundleId = nodeOrTaskId.bundleId;
      taskId = nodeOrTaskId.taskId;
    }

    if (!bundleId || !taskId) {
      vscode.window.showWarningMessage(
        "Select a task from the tree to execute.",
      );
      return;
    }

    const bundle = tree.getBundle(bundleId);
    if (!bundle) {
      vscode.window.showWarningMessage("Bundle not found.");
      return;
    }

    const task = bundle.tasks.find((t) => t.id === taskId);
    if (!task) {
      vscode.window.showErrorMessage(
        `Task "${taskId}" not found in bundle.`,
      );
      return;
    }

    const ctx = tree.getBundleContext(bundleId);
    const prompt = composeTaskPrompt(task, bundle, ctx);
    await openCursorChat(prompt);
  };
}

export function createExecuteBundleCommand(tree: BundleTreeProvider) {
  return async (node?: TreeNode) => {
    const bundleId = node?.bundleId;
    if (!bundleId) {
      vscode.window.showWarningMessage(
        "Select a bundle from the tree to execute.",
      );
      return;
    }

    const bundle = tree.getBundle(bundleId);
    if (!bundle) {
      vscode.window.showWarningMessage("Bundle not found.");
      return;
    }

    const ctx = tree.getBundleContext(bundleId);
    const prompt = composeBundlePrompt(bundle, ctx);
    await openCursorChat(prompt);
  };
}
