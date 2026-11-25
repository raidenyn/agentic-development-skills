import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const { mergeClaudeSettings, mergeOpencodeConfig, requireNode22 } = await import(
  pathToFileURL(join(ASSETS.hookRuntime, 'lib', 'install.mjs')).href
);
const COMMAND = 'node "$CLAUDE_PROJECT_DIR/.agents/harness/hook-runtime/claude.mjs"';
const PLUGIN = './.agents/harness/hook-runtime/opencode';
const EVENTS = { PreToolUse: 10, Stop: 1800 };

test('mergeClaudeSettings keeps foreign entries and is idempotent', async () => {
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'other' }] };
  const r = await tempRepo({
    files: {
      '.claude/settings.json': JSON.stringify({ enabledPlugins: { x: true }, hooks: { PreToolUse: [foreign] } }),
    },
  });
  assert.equal(mergeClaudeSettings(r.dir, COMMAND, EVENTS).code, 0);
  const file = join(r.dir, '.claude/settings.json');
  const s = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(s.hooks.PreToolUse[0], foreign);
  assert.deepEqual(s.enabledPlugins, { x: true });
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.equal(s.hooks.PreToolUse[1].hooks[0].command, COMMAND);
  assert.equal(s.hooks.PreToolUse[1].hooks[0].timeout, 10);
  assert.equal(s.hooks.Stop[0].hooks[0].timeout, 1800);
  const bytes = readFileSync(file);
  assert.equal(mergeClaudeSettings(r.dir, COMMAND, EVENTS).code, 0);
  assert.deepEqual(readFileSync(file), bytes);
  await r.cleanup();
});

test('mergeClaudeSettings refuses JSONC and names the entry to add', async () => {
  const text = '{\n  // comment\n  "hooks": {}\n}\n';
  const r = await tempRepo({ files: { '.claude/settings.json': text } });
  const res = mergeClaudeSettings(r.dir, COMMAND, EVENTS);
  assert.equal(res.code, 1);
  assert.ok(res.messages.join('\n').includes('claude.mjs'));
  assert.equal(readFileSync(join(r.dir, '.claude/settings.json'), 'utf8'), text);
  await r.cleanup();
});

test('mergeOpencodeConfig creates the file and adds the plugin once', async () => {
  const r = await tempRepo();
  assert.equal(mergeOpencodeConfig(r.dir, PLUGIN).code, 0);
  const file = join(r.dir, 'opencode.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { plugins: [PLUGIN] });
  const bytes = readFileSync(file);
  mergeOpencodeConfig(r.dir, PLUGIN);
  assert.deepEqual(readFileSync(file), bytes);
  await r.cleanup();
});

test('mergeOpencodeConfig preserves $schema and other plugins in order', async () => {
  const r = await tempRepo({ files: { 'opencode.json': JSON.stringify({ $schema: 's', plugins: ['one', 'two'] }) } });
  mergeOpencodeConfig(r.dir, PLUGIN);
  const c = JSON.parse(readFileSync(join(r.dir, 'opencode.json'), 'utf8'));
  assert.equal(c.$schema, 's');
  assert.deepEqual(c.plugins, ['one', 'two', PLUGIN]);
  assert.deepEqual(Object.keys(c), ['$schema', 'plugins']);
  await r.cleanup();
});

test('mergeOpencodeConfig refuses JSONC', async () => {
  const r = await tempRepo({ files: { 'opencode.json': '// c\n{}' } });
  assert.equal(mergeOpencodeConfig(r.dir, PLUGIN).code, 1);
  await r.cleanup();
});

test('requireNode22 passes on this runtime', () => {
  assert.equal(requireNode22(), null);
});
