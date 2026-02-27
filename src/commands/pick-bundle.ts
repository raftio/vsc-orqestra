import * as vscode from "vscode";
import * as api from "../api-client";
import type { BundleTreeProvider } from "../views/bundle-tree";

export function createBuildBundleCommand(
  tree: BundleTreeProvider,
  reload: () => Promise<void>,
) {
  return async () => {
    const ticketId = await vscode.window.showInputBox({
      prompt: "Enter ticket ID (e.g. PROJ-123 or owner/repo#42)",
      placeHolder: "PROJ-123",
      ignoreFocusOut: true,
    });
    if (!ticketId) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Building bundle for ${ticketId}…`,
        cancellable: false,
      },
      async () => {
        try {
          await api.buildBundle(ticketId);
          await reload();
          vscode.window.showInformationMessage(
            `Bundle built for ${ticketId}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(`Failed to build bundle: ${msg}`);
        }
      },
    );
  };
}
