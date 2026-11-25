import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, hasStartCondition } from './project-ready.mts';
import type { Decision, Item } from './project-ready.mts';

const done = { state: 'CLOSED', stateReason: 'COMPLETED' };
const open = { state: 'OPEN', stateReason: null };
const dropped = { state: 'CLOSED', stateReason: 'NOT_PLANNED' };
const item = (over: Partial<Item>): Item => ({ status: 'Backlog', state: 'OPEN', body: '', blockers: [], ...over });
// The cases below all expect a decision; a null fails the property access with a clear error.
const decided = (i: Item): Decision => decide(i) as Decision;

test('an item with no blockers and no condition becomes Ready', () => {
  assert.equal(decided(item({})).status, 'Ready');
});

test('an item whose blockers are all completed becomes Ready', () => {
  assert.equal(decided(item({ blockers: [done, done] })).status, 'Ready');
});

test('an open blocker keeps the item in Backlog', () => {
  assert.equal(decided(item({ blockers: [done, open] })).status, 'Backlog');
});

test('a blocker closed as not planned does not unblock', () => {
  assert.equal(decided(item({ blockers: [dropped] })).status, 'Backlog');
});

test('a Ready item with a reopened blocker goes back to Backlog', () => {
  assert.equal(decided(item({ status: 'Ready', blockers: [open] })).status, 'Backlog');
});

test('a start condition keeps the item in Backlog until a person sets it Ready', () => {
  const body = '## Prerequisites\n\n**Ready to start when:**\n- The owner agrees.\n\n## Start';
  assert.equal(decided(item({ body })).status, 'Backlog');
  assert.equal(decided(item({ status: 'Ready', body })).status, 'Ready');
  assert.equal(decided(item({ status: 'Ready', body, blockers: [open] })).status, 'Backlog');
});

test("'no conditions' is not a start condition", () => {
  assert.equal(hasStartCondition('**Ready to start when:** no conditions\n\n## Start'), false);
  assert.equal(hasStartCondition('**Ready to start when:** No conditions.\n'), false);
  assert.equal(hasStartCondition('no such field'), false);
  assert.equal(hasStartCondition('**Ready to start when:** harness M2 is onboarded'), true);
});

test('items in another Status and closed issues are not managed', () => {
  assert.equal(decide(item({ status: 'In progress' })), null);
  assert.equal(decide(item({ status: 'Todo' })), null);
  assert.equal(decide(item({ status: null })), null);
  assert.equal(decide(item({ state: 'CLOSED' })), null);
});
