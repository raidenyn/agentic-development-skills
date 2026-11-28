# Verification Report

**Change**: `conductor-title-from-board`
**Iteration**: `1`

- `openspec validate --all`: 12 passed, 0 failed.
- `node scripts/verify.mts`: 451 passed, 0 failed, and both harness tools report `ok`. An earlier run under load average 10.9 failed the timing test `opencode-adapter.test.mjs:581` with a run budget of 341 to 377 ms against the 380 ms it requires. The test passed 3 of 3 times on its own, and the full suite passed at load 3.8. This change touches no code.
- Launch-line parser:
  - `/project-conductor https://github.com/users/raidenyn/projects/4` gives `user raidenyn 4`.
  - `/project-conductor:project-conductor https://github.com/orgs/acme/projects/12/ please` gives `organization acme 12`.
  - `.../projects/4x` and `onboard https://...` give nothing.
- First-message read on the live Bank MCP conductor: `afterPosition` -1, `limit` 1 and `view` `"messages"` returned position 0, `/project-conductor https://github.com/users/raidenyn/projects/4`.

## Result

PASS
