import * as vscode from "vscode";
import { BundleTreeProvider } from "./views/bundle-tree";
import * as api from "./api-client";
import { createBuildBundleCommand } from "./commands/pick-bundle";
import { createSubmitEvidenceCommand } from "./commands/submit-evidence";
import {
  createExecuteTaskCommand,
  createExecuteBundleCommand,
} from "./commands/execute-task";
import { StatusBarController } from "./status-bar";

async function loadAllBundles(
  tree: BundleTreeProvider,
  statusBar: StatusBarController,
): Promise<void> {
  try {
    const { bundles } = await api.listBundles();
    const entries = await Promise.all(
      bundles.map(async (bundle) => ({
        bundle,
        context: await api.getContext(bundle.ticket_ref).catch(() => null),
      })),
    );
    tree.setBundles(entries);
    statusBar.setBundleCount(entries.length);
  } catch {
    // API not available — leave tree empty
  }
}

export function activate(context: vscode.ExtensionContext) {
  const tree = new BundleTreeProvider();
  const statusBar = new StatusBarController();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("orqestra.bundleTree", tree),
    statusBar,
  );

  const reload = () => loadAllBundles(tree, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "orqestra.fetchBundle",
      createBuildBundleCommand(tree, reload),
    ),
    vscode.commands.registerCommand("orqestra.refreshBundle", reload),
    vscode.commands.registerCommand(
      "orqestra.submitEvidence",
      createSubmitEvidenceCommand(tree),
    ),
    vscode.commands.registerCommand(
      "orqestra.executeTask",
      createExecuteTaskCommand(tree),
    ),
    vscode.commands.registerCommand(
      "orqestra.executeBundle",
      createExecuteBundleCommand(tree),
    ),
    vscode.commands.registerCommand("orqestra.disconnect", () => {
      tree.clear();
      statusBar.reset();
      vscode.window.showInformationMessage("Orqestra: disconnected.");
    }),
  );

  reload();
}

export function deactivate() {}
