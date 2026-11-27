// .agents/harness/lock.json: per tool, its version and the sha256 of each copied file
// (harness RFC, "Vendored tool layout").
export interface LockEntry {
  version: string;
  files: Record<string, string>;
}

export interface LockFile {
  version: number;
  tools: Record<string, LockEntry>;
}

// tool.json at the root of each tool folder.
export interface ToolMeta {
  name: string;
  version: string;
  handler?: boolean;
  // Handler tools only: the tool kinds the handler needs, validated by declaredKinds.
  tools?: unknown;
}
