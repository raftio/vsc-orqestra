import type { BundleTask, ExecutionBundle, SynthesizedContext } from "./types";

export function composeTaskPrompt(
  task: BundleTask,
  bundle: ExecutionBundle,
  ctx: SynthesizedContext | null,
): string {
  const lines: string[] = [
    `Implement the following task for ticket ${bundle.ticket_ref}:`,
    "",
    `## Task: ${task.title}`,
  ];

  if (task.description) {
    lines.push(task.description);
  }

  const acs = ctx?.acceptance_criteria;
  if (acs?.length) {
    lines.push("", "## Acceptance Criteria");
    for (const ac of acs) {
      lines.push(`- ${ac.description}`);
    }
  }

  const excerpts = ctx?.excerpts ?? bundle.context?.excerpts;
  if (excerpts?.length) {
    lines.push("", "## Context");
    for (const e of excerpts) {
      lines.push(`- ${e}`);
    }
  }

  lines.push("", "Implement this task following the acceptance criteria above.");

  return lines.join("\n");
}

export function composeBundlePrompt(
  bundle: ExecutionBundle,
  ctx: SynthesizedContext | null,
): string {
  const lines: string[] = [
    `Implement all tasks for ticket ${bundle.ticket_ref}:`,
  ];

  for (const task of bundle.tasks) {
    lines.push("", `## Task: ${task.title}`);
    if (task.description) {
      lines.push(task.description);
    }
  }

  const deps = bundle.dependencies;
  if (deps?.length) {
    lines.push("", "## Task Dependencies");
    for (const d of deps) {
      lines.push(`- ${d.taskId} depends on ${d.dependsOn}`);
    }
  }

  const acs = ctx?.acceptance_criteria;
  if (acs?.length) {
    lines.push("", "## Acceptance Criteria");
    for (const ac of acs) {
      lines.push(`- ${ac.description}`);
    }
  }

  const excerpts = ctx?.excerpts ?? bundle.context?.excerpts;
  if (excerpts?.length) {
    lines.push("", "## Context");
    for (const e of excerpts) {
      lines.push(`- ${e}`);
    }
  }

  lines.push(
    "",
    "Implement all tasks above in order, respecting dependencies and acceptance criteria.",
  );

  return lines.join("\n");
}
