import * as vscode from "vscode";
import type { ExecutionBundle, SynthesizedContext } from "../types";

type NodeKind = "bundle" | "section" | "task" | "ac" | "excerpt" | "info";

export interface TreeNode {
  kind: NodeKind;
  label: string;
  description?: string;
  tooltip?: string;
  children?: TreeNode[];
  collapsible?: boolean;
  bundleId?: string;
  taskId?: string;
}

export interface BundleEntry {
  bundle: ExecutionBundle;
  context: SynthesizedContext | null;
}

export class BundleTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private entries: BundleEntry[] = [];
  private roots: TreeNode[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setBundles(entries: BundleEntry[]): void {
    this.entries = entries;
    this.roots = this.buildRoots();
    this.refresh();
  }

  addBundle(bundle: ExecutionBundle, ctx: SynthesizedContext | null): void {
    const idx = this.entries.findIndex((e) => e.bundle.id === bundle.id);
    if (idx >= 0) {
      this.entries[idx] = { bundle, context: ctx };
    } else {
      this.entries.unshift({ bundle, context: ctx });
    }
    this.roots = this.buildRoots();
    this.refresh();
  }

  clear(): void {
    this.entries = [];
    this.roots = [];
    this.refresh();
  }

  getBundle(bundleId: string): ExecutionBundle | null {
    return this.entries.find((e) => e.bundle.id === bundleId)?.bundle ?? null;
  }

  getBundleContext(bundleId: string): SynthesizedContext | null {
    return this.entries.find((e) => e.bundle.id === bundleId)?.context ?? null;
  }

  getAllEntries(): BundleEntry[] {
    return this.entries;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const state = element.children?.length
      ? element.kind === "bundle"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.label, state);

    if (element.description) {
      item.description = element.description;
    }
    if (element.tooltip) {
      item.tooltip = new vscode.MarkdownString(element.tooltip);
    }

    item.iconPath = this.iconFor(element.kind);

    if (element.kind === "bundle") {
      item.contextValue = "bundle";
    } else if (element.kind === "task" && element.taskId) {
      item.contextValue = "task";
    }

    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) return this.roots;
    return element.children ?? [];
  }

  private buildRoots(): TreeNode[] {
    if (this.entries.length === 0) {
      return [
        {
          kind: "info",
          label: "No bundles loaded",
          description: "Use 'Orca: Fetch Bundle' to get started",
        },
      ];
    }

    return this.entries.map((entry) => this.buildBundleNode(entry));
  }

  private buildBundleNode({ bundle, context }: BundleEntry): TreeNode {
    const children: TreeNode[] = [];

    if (bundle.tasks.length) {
      const depMap = new Map<string, string[]>();
      for (const d of bundle.dependencies ?? []) {
        const list = depMap.get(d.taskId) ?? [];
        list.push(d.dependsOn);
        depMap.set(d.taskId, list);
      }

      children.push({
        kind: "section",
        label: `Tasks (${bundle.tasks.length})`,
        bundleId: bundle.id,
        children: bundle.tasks.map((t) => {
          const deps = depMap.get(t.id);
          const desc = deps ? `depends on: ${deps.join(", ")}` : undefined;
          return {
            kind: "task" as NodeKind,
            label: t.title,
            description: desc,
            tooltip: t.description || undefined,
            bundleId: bundle.id,
            taskId: t.id,
          };
        }),
      });
    }

    const acs = context?.acceptance_criteria;
    if (acs?.length) {
      children.push({
        kind: "section",
        label: `Acceptance Criteria (${acs.length})`,
        bundleId: bundle.id,
        children: acs.map((ac) => ({
          kind: "ac" as NodeKind,
          label: ac.id,
          description: ac.description,
          tooltip: ac.description,
          bundleId: bundle.id,
        })),
      });
    }

    const excerpts = context?.excerpts ?? bundle.context?.excerpts;
    if (excerpts?.length) {
      children.push({
        kind: "section",
        label: `Context (${excerpts.length})`,
        bundleId: bundle.id,
        children: excerpts.map((e) => ({
          kind: "excerpt" as NodeKind,
          label: e.length > 80 ? e.slice(0, 80) + "..." : e,
          tooltip: e,
          bundleId: bundle.id,
        })),
      });
    }

    const ticketLabel = context?.ticket_title ?? bundle.ticket_ref;

    return {
      kind: "bundle",
      label: ticketLabel,
      description: `v${bundle.version} · ${bundle.tasks.length} task(s)`,
      tooltip: context?.ticket_description || `Bundle ${bundle.id}`,
      bundleId: bundle.id,
      children,
    };
  }

  private iconFor(kind: NodeKind): vscode.ThemeIcon {
    switch (kind) {
      case "bundle":
        return new vscode.ThemeIcon("package");
      case "section":
        return new vscode.ThemeIcon("symbol-folder");
      case "task":
        return new vscode.ThemeIcon("tasklist");
      case "ac":
        return new vscode.ThemeIcon("checklist");
      case "excerpt":
        return new vscode.ThemeIcon("note");
      case "info":
        return new vscode.ThemeIcon("info");
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}
