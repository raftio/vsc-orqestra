import * as vscode from "vscode";

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50,
    );
    this.item.command = "orqestra.fetchBundle";
    this.reset();
    this.item.show();
  }

  setBundleCount(count: number): void {
    this.item.text = `$(symbol-structure) Orqestra (${count})`;
    this.item.tooltip = `${count} bundle(s) loaded\nClick to add a new bundle`;
  }

  reset(): void {
    this.item.text = "$(symbol-structure) Orqestra";
    this.item.tooltip = "Click to fetch an execution bundle";
  }

  dispose(): void {
    this.item.dispose();
  }
}
