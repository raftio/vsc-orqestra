import * as vscode from "vscode";

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50,
    );
    this.item.command = "orca.fetchBundle";
    this.reset();
    this.item.show();
  }

  setBundleCount(count: number): void {
    this.item.text = `$(symbol-structure) Orca (${count})`;
    this.item.tooltip = `${count} bundle(s) loaded\nClick to add a new bundle`;
  }

  reset(): void {
    this.item.text = "$(symbol-structure) Orca";
    this.item.tooltip = "Click to fetch an execution bundle";
  }

  dispose(): void {
    this.item.dispose();
  }
}
