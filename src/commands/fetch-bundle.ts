import * as vscode from "vscode";
import * as api from "../api-client";
import type { BundleTreeProvider } from "../views/bundle-tree";
import type { StatusBarController } from "../status-bar";

export function createFetchBundleCommand(
  tree: BundleTreeProvider,
  statusBar: StatusBarController,
) {
  return async () => {
    const ticketId = await vscode.window.showInputBox({
      prompt: "Enter ticket ID (e.g. PROJ-123)",
      placeHolder: "PROJ-123",
      ignoreFocusOut: true,
    });

    if (!ticketId) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching bundle for ${ticketId}...`,
        cancellable: false,
      },
      async () => {
        try {
          const [bundle, ctx] = await Promise.all([
            api.buildBundle(ticketId),
            api.getContext(ticketId).catch(() => null),
          ]);

          tree.setData(bundle, ctx);
          statusBar.setTicket(ticketId, bundle.id);
          vscode.window.showInformationMessage(
            `Bundle loaded: ${bundle.tasks.length} task(s) for ${ticketId}`,
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Failed to fetch bundle: ${msg}`,
          );
        }
      },
    );
  };
}

export function createRefreshBundleCommand(
  tree: BundleTreeProvider,
  statusBar: StatusBarController,
) {
  return async () => {
    const existing = tree.getBundle();
    if (!existing) {
      vscode.window.showWarningMessage(
        "No bundle loaded. Use 'Orca: Fetch Bundle' first.",
      );
      return;
    }

    const ticketId = existing.ticket_ref;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Refreshing bundle for ${ticketId}...`,
        cancellable: false,
      },
      async () => {
        try {
          const [bundle, ctx] = await Promise.all([
            api.buildBundle(ticketId),
            api.getContext(ticketId).catch(() => null),
          ]);

          tree.setData(bundle, ctx);
          statusBar.setTicket(ticketId, bundle.id);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(
            `Failed to refresh bundle: ${msg}`,
          );
        }
      },
    );
  };
}
