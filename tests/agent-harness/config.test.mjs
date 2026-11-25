import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSETS, tempRepo } from './helpers.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { readHarnessConfig, loadSection, ConfigError } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'config.mjs')).href
);

const opts = { keys: ['command'], required: [], defaults: {} };

test('loadSection rejects an unknown own key', async () => {
  const r = await tempRepo({ files: { '.agents/harness.json': JSON.stringify({ 'verify-gate': { command: ['true'], colour: 1 } }) } });
  const { errors } = loadSection(r.dir, 'verify-gate', opts);
  assert.ok(errors.some((e) => e.includes('colour')));
  await r.cleanup();
});

test("loadSection ignores other tools' keys", async () => {
  const r = await tempRepo({ files: { '.agents/harness.json': JSON.stringify({ 'other-tool': { x: 1 }, 'verify-gate': { command: ['true'] } }) } });
  assert.deepEqual(loadSection(r.dir, 'verify-gate', opts).errors, []);
  await r.cleanup();
});

test('loadSection reports a missing required key', async () => {
  const r = await tempRepo({ files: { '.agents/harness.json': JSON.stringify({ 'verify-gate': {} }) } });
  const { errors } = loadSection(r.dir, 'verify-gate', { ...opts, required: ['command'] });
  assert.ok(errors.some((e) => e.includes('command')));
  await r.cleanup();
});

test('missing file gives defaults', async () => {
  const r = await tempRepo();
  const { section, errors } = loadSection(r.dir, 'verify-gate', { ...opts, defaults: { base: 'origin/main' } });
  assert.deepEqual(errors, []);
  assert.deepEqual(section, { base: 'origin/main' });
  assert.deepEqual(readHarnessConfig(r.dir), {});
  await r.cleanup();
});

test('readHarnessConfig throws ConfigError on invalid JSON or non-object', async () => {
  const r = await tempRepo({ files: { '.agents/harness.json': '{nope' } });
  assert.throws(() => readHarnessConfig(r.dir), ConfigError);
  await r.write('.agents/harness.json', '[1]');
  assert.throws(() => readHarnessConfig(r.dir), ConfigError);
  await r.cleanup();
});
