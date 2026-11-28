## 1. Webhook coalesceKey

- [x] 1.1 In `references/triggers-github.md`, set the webhook trigger's `coalesceKey` to `{{headers.x-github-hook-id}}`, explain why in the rules, and drop the "unavoidable `coalesceKey` gap" from the fix rule.

## 2. Thread scans read messages

- [x] 2.1 In `references/triggers-github.md` (the backward scan), use `view` `"messages"` and say why.
- [x] 2.2 In `references/onboarding-github.md` (a run that reuses the webhook trigger), use `view` `"messages"` and add the early stop.

## 3. Hook added by the owner

- [x] 3.1 Add "Done by the owner" to `references/triggers-github.md`, the new result value to the standalone report, and the removal rule to Webhook owner steps.
- [x] 3.2 Add step 4 to Register the webhook in `SKILL.md`.

## 4. Checks

- [x] 4.1 Run `openspec validate --all`, `node scripts/verify.mts` (skills validate, `claude plugin validate .`, the Python tests and `pnpm run check`).
- [x] 4.2 Prove it live on board 4: run the trigger compare from the reference on the live webhook trigger, and run the messages-view scan on the conductor thread.
