// The hook handler interface (harness RFC, contract "Hook handler interface"), as the runtime
// implements it in src/hook-runtime/lib/runtime.mts. Never emitted: imported with `import type`.

export type HarnessEvent = 'tool.before' | 'tool.after' | 'prompt' | 'turn.end' | 'compact' | 'session.start';
export type HostName = 'claude-code' | 'opencode' | (string & {});
export type ToolKind = 'shell' | 'edit' | 'read' | 'other';

// A host event after the adapter normalized it. Fields beyond `type` and `host` depend on the type.
export interface EventPayload {
  type: HarnessEvent;
  host: HostName;
  tool?: { name: string; kind: ToolKind; input: Record<string, unknown>; callId?: unknown };
  // tool.before / tool.after on a shell tool: the command line.
  command?: string;
  // tool.after on an edit tool: repo-relative paths with forward slashes.
  files?: string[];
  prompt?: string;
  afterCompact?: boolean;
  // turn.end: running background subagents.
  background?: number;
  [field: string]: unknown;
}

// What an adapter extracts from a host payload: the event and who it belongs to.
export interface AdaptedEvent {
  event: EventPayload;
  sessionId: string;
  agentId: string;
}

export interface HandlerContext {
  repoRoot: string;
  host: HostName;
  sessionId?: string;
  agentId?: string;
  // Epoch milliseconds by which the handler must settle.
  deadline: number;
  signal: AbortSignal;
  // Per session and agent; set before the handler runs.
  stateDir?: string;
  // This tool's section of .agents/harness.json.
  config: Record<string, any>;
  proof(name: string): Promise<string | null>;
  trace(outcome: unknown): void;
}

export type HandlerResult =
  | { deny: string }
  | { context: string }
  | { block: string; ack?: () => unknown; release?: () => unknown };

// Returns null when the proof holds, otherwise the failure text.
export type ProofCheck = (context: HandlerContext) => string | null | undefined | Promise<string | null | undefined>;

export interface Handler {
  name: string;
  // The tool folder the handler came from; defaults to name.
  tool?: string;
  events: readonly HarnessEvent[];
  handle(
    event: EventPayload,
    context: HandlerContext,
    extra?: { cleanupDeadline?: number },
  ): HandlerResult | null | undefined | Promise<HandlerResult | null | undefined>;
  proofs?: Record<string, ProofCheck>;
  // Per-event budget in milliseconds.
  timeouts?: Partial<Record<HarnessEvent, number>>;
  // Text that replaces "Do this step by hand." in a failure notice.
  manual?: string;
}

// The merged result of one dispatch, before an adapter turns it into host output.
export interface DispatchResult {
  notices: string[];
  outcomes: Record<string, string>;
  deny?: string;
  block?: string;
  context?: string;
  ack?: () => Promise<void>;
  release?: () => Promise<void>;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  // Keep at most this many bytes of each stream; the oldest bytes are dropped.
  maxBytes?: number;
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  pgid?: number;
  timedOut: boolean;
  truncated: boolean;
  stdout: string;
  stderr: string;
}

export interface LockHandle {
  release(): Promise<void>;
}

// The context a handler receives inside a worker: processes and the gate lock go through the
// supervisor, which owns them (harness design D3).
export interface WorkerContext extends HandlerContext {
  spawn(argv: readonly unknown[], opts?: SpawnOptions): Promise<SpawnResult>;
  lock: { acquire(dir: string): Promise<LockHandle | null> };
}
