import { appendFileSync } from "node:fs"
let raw = ""; for await (const c of process.stdin) raw += c
appendFileSync(process.env.CLAUDE_PROJECT_DIR + "/spike.log", raw.replace(/\n/g, " ") + "\n")
process.exit(0)
