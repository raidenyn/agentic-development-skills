---
pointer: "Harness tools: bump tool.json, never edit assets, run harness:update"
skills: ["agent-harness-hook-runtime", "agent-harness-verify-gate", "agent-harness-hooked-rules", "agent-harness-hook-runtime:agent-harness-hook-runtime", "agent-harness-verify-gate:agent-harness-verify-gate", "agent-harness-hooked-rules:agent-harness-hooked-rules"]
commands: ["\\bpnpm\\s+(run\\s+)?(build|harness:update)(?=\\s|$)"]
---

This repo ships its harness tools from `src/<tool>/` as committed `.mjs` under `skills/<skill>/assets/<tool>/`.

- Change a tool in `src/`, never by hand: bump `version` in `src/<tool>/tool.json` once per pull request, then run `pnpm run harness:update`. It rebuilds the assets and refreshes the installed copy in `.agents/harness/` and `.agents/harness/lock.json`.
- Never edit `skills/*/assets/` or `.agents/harness/` directly; the build and `harness:update` write them, and `vendored.test.mjs` plus the verify gate's `check` compare them byte for byte.
