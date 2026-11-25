import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, hasStartCondition } from "./project-ready.mjs";

const done = { state: "CLOSED", stateReason: "COMPLETED" };
const open = { state: "OPEN", stateReason: null };
const dropped = { state: "CLOSED", stateReason: "NOT_PLANNED" };
const item = (over) => ({ status: "Backlog", state: "OPEN", body: "", blockers: [], ...over });

test("an item with no blockers and no condition becomes Ready", () => {
  assert.equal(decide(item({})).status, "Ready");
});

test("an item whose blockers are all completed becomes Ready", () => {
  assert.equal(decide(item({ blockers: [done, done] })).status, "Ready");
});

test("an open blocker keeps the item in Backlog", () => {
  assert.equal(decide(item({ blockers: [done, open] })).status, "Backlog");
});

test("a blocker closed as not planned does not unblock", () => {
  assert.equal(decide(item({ blockers: [dropped] })).status, "Backlog");
});

test("a Ready item with a reopened blocker goes back to Backlog", () => {
  assert.equal(decide(item({ status: "Ready", blockers: [open] })).status, "Backlog");
});

test("a start condition keeps the item in Backlog until a person sets it Ready", () => {
  const body = "## Prerequisites\n\n**Ready to start when:**\n- The owner agrees.\n\n## Start";
  assert.equal(decide(item({ body })).status, "Backlog");
  assert.equal(decide(item({ status: "Ready", body })).status, "Ready");
  assert.equal(decide(item({ status: "Ready", body, blockers: [open] })).status, "Backlog");
});

test("'no conditions' is not a start condition", () => {
  assert.equal(hasStartCondition("**Ready to start when:** no conditions\n\n## Start"), false);
  assert.equal(hasStartCondition("**Ready to start when:** No conditions.\n"), false);
  assert.equal(hasStartCondition("no such field"), false);
  assert.equal(hasStartCondition("**Ready to start when:** harness M2 is onboarded"), true);
});

test("items in another Status and closed issues are not managed", () => {
  assert.equal(decide(item({ status: "In progress" })), null);
  assert.equal(decide(item({ status: "Todo" })), null);
  assert.equal(decide(item({ status: null })), null);
  assert.equal(decide(item({ state: "CLOSED" })), null);
});
