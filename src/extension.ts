import * as vscode from "vscode";
import { BundleTreeProvider } from "./views/bundle-tree";
import type { WorkspaceEntry, BundleEntry } from "./views/bundle-tree";
import { ChatViewProvider } from "./views/chat-panel";
import * as api from "./api-client";
import * as auth from "./auth";
import { createFetchBundleCommand } from "./commands/pick-bundle";
import { createSubmitEvidenceCommand } from "./commands/submit-evidence";
import {
  createExecuteTaskCommand,
  createExecuteBundleCommand,
} from "./commands/execute-task";
import { StatusBarController } from "./status-bar";

function setLoggedIn(value: boolean): void {
  vscode.commands.executeCommand("setContext", "or.loggedIn", value);
}

async function loadAllWorkspaces(
  tree: BundleTreeProvider,
  statusBar: StatusBarController,
): Promise<void> {
  if (!(await auth.isLoggedIn())) {
    tree.clear();
    statusBar.reset();
    setLoggedIn(false);
    return;
  }

  setLoggedIn(true);

  try {
    const { workspaces } = await api.listWorkspaces();

    const wsEntries: WorkspaceEntry[] = await Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const { bundles } = await api.listBundles(workspace.id);

          const entries: BundleEntry[] = bundles.map((bundle) => ({
            bundle,
            context: null,
          }));

          return { workspace, bundles: entries };
        } catch {
          return { workspace, bundles: [] };
        }
      }),
    );

    tree.setWorkspaces(wsEntries);

    const totalBundles = wsEntries.reduce(
      (sum, ws) => sum + ws.bundles.length,
      0,
    );
    statusBar.setBundleCount(totalBundles);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("401") || err.message.includes("Invalid token"))
    ) {
      await auth.logout();
      setLoggedIn(false);
      tree.clear();
      statusBar.reset();
      vscode.window.showWarningMessage(
        "OR: session expired. Please sign in again.",
      );
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  auth.init(context);

  const tree = new BundleTreeProvider();
  const statusBar = new StatusBarController();
  const chatProvider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("or.bundleTree", tree),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    statusBar,
  );

  const reload = () => loadAllWorkspaces(tree, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("or.login", async () => {
      try {
        const result = await auth.login();
        if (result) {
          vscode.window.showInformationMessage(
            `Signed in as ${result.user.email}`,
          );
          await reload();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        vscode.window.showErrorMessage(`OR login failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand("or.logout", async () => {
      await auth.logout();
      tree.clear();
      statusBar.reset();
      setLoggedIn(false);
      vscode.window.showInformationMessage("OR: signed out.");
    }),

    vscode.commands.registerCommand(
      "or.fetchBundle",
      createFetchBundleCommand(reload),
    ),
    vscode.commands.registerCommand("or.refreshBundle", reload),
    vscode.commands.registerCommand(
      "or.submitEvidence",
      createSubmitEvidenceCommand(tree),
    ),
    vscode.commands.registerCommand(
      "or.executeTask",
      createExecuteTaskCommand(tree),
    ),
    vscode.commands.registerCommand(
      "or.executeBundle",
      createExecuteBundleCommand(tree),
    ),
    vscode.commands.registerCommand("or.disconnect", async () => {
      await auth.logout();
      tree.clear();
      statusBar.reset();
      setLoggedIn(false);
      vscode.window.showInformationMessage("OR: disconnected.");
    }),

    vscode.commands.registerCommand("or.openChat", () => {
      vscode.commands.executeCommand("or.chatView.focus");
    }),
  );

  reload();
}

export function deactivate() {}
