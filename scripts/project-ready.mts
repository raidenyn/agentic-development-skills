#!/usr/bin/env node
// Keep the Status of project board items in step with their blockers.
//
// An item whose issue is open moves from Backlog to Ready when every issue that
// blocks it is closed as completed and its body names no start condition. An
// item with a start condition stays in Backlog until a person sets it Ready. An
// item in Ready moves back to Backlog when one of its blockers is open again or
// was closed without being completed. Items in any other Status, and items
// whose issue is closed, are left alone.
//
// Usage: PROJECT_OWNER=<login> PROJECT_NUMBERS=5,6 GH_TOKEN=<token> node scripts/project-ready.mts [--dry-run]

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MANAGED = new Set(["backlog", "ready"]);

export interface Blocker {
  state: string;
  stateReason: string | null;
}
export interface Item {
  status: string | null;
  state: string;
  body: string | null;
  blockers: Blocker[];
  [field: string]: unknown;
}
export interface Decision {
  status: "Backlog" | "Ready";
  reason: string;
}

/** True when the issue body names a condition that a person must confirm. */
export function hasStartCondition(body: string | null | undefined): boolean {
  const match = /\*\*Ready to start when:\*\*([^\n]*(?:\n(?!\n)[^\n]*)*)/.exec(body ?? "");
  if (!match) return false;
  const text = (match[1] as string).trim().toLowerCase().replace(/[.\s]+$/, "");
  return !(text === "" || text === "no conditions" || text === "none");
}

/**
 * Decide the Status an item should have.
 * Returns { status, reason }, or null when the item is not managed here.
 */
export function decide(item: Item): Decision | null {
  const current = (item.status ?? "").toLowerCase();
  if (item.state !== "OPEN" || !MANAGED.has(current)) return null;
  const open = item.blockers.filter((b) => b.state !== "CLOSED");
  if (open.length > 0) return { status: "Backlog", reason: `${open.length} open blocker(s)` };
  const failed = item.blockers.filter((b) => b.stateReason !== "COMPLETED");
  if (failed.length > 0) {
    return { status: "Backlog", reason: `${failed.length} blocker(s) closed without being completed` };
  }
  // A start condition is confirmed by a person, who then sets Ready by hand. So it only
  // holds an item back in Backlog; it never moves a Ready item back.
  if (current === "backlog" && hasStartCondition(item.body)) {
    return { status: "Backlog", reason: "a start condition needs a person" };
  }
  return { status: "Ready", reason: "every blocker is completed" };
}

const QUERY = `
query($owner: String!, $number: Int!, $cursor: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content {
            ... on Issue {
              number state body
              repository { nameWithOwner }
              blockedBy(first: 100) { totalCount nodes { state stateReason } }
            }
          }
        }
      }
    }
  }
}`;

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
}

function graphql(query: string, variables: Record<string, unknown>): any {
  const out = gh(["api", "graphql", "--input", "-"], JSON.stringify({ query, variables }));
  const parsed = JSON.parse(out);
  if (parsed.errors) throw new Error(JSON.stringify(parsed.errors));
  return parsed.data;
}

function readProject(owner: string, number: number): any {
  const items: Item[] = [];
  let cursor: string | null = null;
  let project: any;
  do {
    project = graphql(QUERY, { owner, number, cursor }).user.projectV2;
    if (!project) throw new Error(`project ${owner}/${number} not found or not readable`);
    for (const node of project.items.nodes) {
      const issue = node.content;
      if (!issue || issue.number === undefined) continue;
      if (issue.blockedBy.totalCount > issue.blockedBy.nodes.length) {
        throw new Error(`${issue.repository.nameWithOwner}#${issue.number} has more blockers than one page holds`);
      }
      items.push({
        id: node.id,
        ref: `${issue.repository.nameWithOwner}#${issue.number}`,
        status: node.fieldValueByName?.name ?? null,
        state: issue.state,
        body: issue.body,
        blockers: issue.blockedBy.nodes,
      });
    }
    cursor = project.items.pageInfo.endCursor;
  } while (project.items.pageInfo.hasNextPage);
  return { id: project.id, field: project.field, items };
}

function main() {
  const owner = process.env.PROJECT_OWNER;
  const numbers = (process.env.PROJECT_NUMBERS ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const dryRun = process.argv.includes("--dry-run");
  if (!owner || numbers.length === 0) {
    console.error("Set PROJECT_OWNER and PROJECT_NUMBERS (comma-separated).");
    process.exit(2);
  }
  let failed = false;
  for (const n of numbers) {
    const project = readProject(owner, Number(n));
    const option = (name: string) => project.field?.options.find((o: { name: string }) => o.name.toLowerCase() === name.toLowerCase());
    if (!option("Backlog") || !option("Ready")) {
      console.error(`project ${n}: Status has no Backlog or no Ready option; skipped`);
      failed = true;
      continue;
    }
    let changed = 0;
    for (const item of project.items) {
      const wanted = decide(item);
      if (!wanted || wanted.status.toLowerCase() === item.status.toLowerCase()) continue;
      changed += 1;
      console.log(`${dryRun ? "would set" : "set"} ${item.ref}: ${item.status} -> ${wanted.status} (${wanted.reason})`);
      if (dryRun) continue;
      graphql(
        `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
          updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field,
            value: {singleSelectOptionId: $option}}) { projectV2Item { id } } }`,
        { project: project.id, item: item.id, field: project.field.id, option: option(wanted.status).id },
      );
    }
    console.log(`project ${n}: ${project.items.length} issues read, ${changed} ${dryRun ? "to change" : "changed"}`);
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
