import { appendFileSync, existsSync, writeFileSync, readFileSync } from "node:fs"
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
let raw = ""
for await (const chunk of process.stdin) raw += chunk
const p = JSON.parse(raw)
appendFileSync(root + "/spike.log", JSON.stringify({ t: Date.now(), env: { CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR } , p }) + "\n")
const ev = p.hook_event_name
let out = null
const flag = (n) => root + "/.git/spike-" + n
if (ev === "PreToolUse" && JSON.stringify(p.tool_input || {}).includes("HARNESS_DENY")) out = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "HARNESS_DENIED by spike hook" } }
if (ev === "PostToolUse") out = { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "HARNESS_AFTER agent=" + (p.agent_id || "main") } }
if (ev === "SessionStart" && p.source === "compact") out = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Project rule re-delivered after compaction: the project codeword is PINEAPPLE-7." } }
if (ev === "Stop" && process.env.SPIKE_BLOCK && !existsSync(flag("block-" + p.session_id))) { writeFileSync(flag("block-" + p.session_id), "1"); out = { decision: "block", reason: "HARNESS_BLOCK: the spike hook blocked this turn end. Reply with exactly BLOCKSEEN." } }
if (out) process.stdout.write(JSON.stringify(out))
process.exit(0)
