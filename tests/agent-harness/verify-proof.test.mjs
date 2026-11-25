// The verify-pass proof (design D5 "Proof"): it holds exactly when pass.json matches the current
// content key and config.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS } from './helpers.mjs';
import { edit, fire, proofCtx, turnEnd, verifyRepo } from './verify-helpers.mjs';

const { createVerifyHandler } = await import(pathToFileURL(join(ASSETS.verifyGate, 'handler.mjs')).href);
const h = createVerifyHandler();
const proof = (r) => h.proofs['verify-pass'](proofCtx(r));
const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function repo() {
  const r = await verifyRepo({ files: { 'src/a.js': 'a\n' } });
  cleanups.push(r.cleanup);
  return r;
}

test('verify-pass holds after a full pass', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  assert.equal(await proof(r), null);
});

test('verify-pass holds after committing unchanged content', async () => {
  const r = await repo();
  await r.write('src/a.js', 'changed\n');
  await fire(h, r, turnEnd());
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'work');
  assert.equal(await proof(r), null);
});

test('verify-pass fails after an edit with "content changed"', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  await r.write('src/a.js', 'a\r\n');
  assert.equal(await proof(r), 'verify-pass: the content changed since the last pass');
});

test('verify-pass fails after a config change', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  await r.setConfig({ timeoutSeconds: 60 });
  assert.equal(await proof(r), 'verify-pass: the verify-gate config changed since the last pass');
});

test('verify-pass never holds after only edit runs', async () => {
  const r = await repo();
  await r.write('src/a.js', 'b\n');
  await fire(h, r, edit(['src/a.js']));
  await r.write('src/a.js', 'c\n');
  await fire(h, r, edit(['src/a.js']));
  assert.equal(r.log().length, 2);
  assert.equal(await proof(r), 'verify-pass: no full pass yet');
});

test('verify-pass fails after a full failure', async () => {
  const r = await repo();
  await fire(h, r, turnEnd());
  r.fail();
  await r.write('src/a.js', 'z\n');
  await fire(h, r, turnEnd());
  assert.equal(await proof(r), 'verify-pass: no full pass yet');
});
