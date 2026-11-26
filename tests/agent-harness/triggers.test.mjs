// Trigger helpers (design D5 "Ticked task"): globs, checkbox items, the one tick detector over a
// before-image and the file afterwards, and deduplication against the tasks.json snapshot.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS } from './helpers.mjs';

const { matchesGlob, matchesPathGlob, parseItem, itemCounts, detectTicks, suppressSeen } = await import(
  pathToFileURL(join(ASSETS.verifyGate, 'lib', 'triggers.mjs')).href
);

const fixture = (p) => JSON.parse(readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
const ticks = (before, after) => detectTicks(itemCounts(before), itemCounts(after));

test('matchesGlob: * stays within a segment, ** crosses segments', () => {
  assert.equal(matchesGlob('openspec/changes/*/tasks.md', 'openspec/changes/x/tasks.md'), true);
  assert.equal(matchesGlob('openspec/changes/*/tasks.md', 'openspec/changes/x/y/tasks.md'), false);
  assert.equal(matchesGlob('openspec/**/tasks.md', 'openspec/changes/x/y/tasks.md'), true);
  assert.equal(matchesGlob('openspec/**/tasks.md', 'openspec/tasks.md'), true);
  assert.equal(matchesGlob('**/*.md', 'a.md'), true);
  assert.equal(matchesGlob('docs/*.md', 'docs/a.txt'), false);
  assert.equal(matchesGlob('a.b/*.md', 'aXb/c.md'), false, 'dots are literal');
});

test('matchesPathGlob: segment by segment, like the task-file walker', () => {
  const rows = [
    ['**/*.ts', 'root.ts', true],
    ['**/*.ts', 'src/a/b.ts', true],
    ['**/*.ts', 'README.md', false],
    ['./src/**/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src\\a.ts', false],
    ['src\\*.ts', 'src/a.ts', true],
    ['*.ts', 'src/a\\b.ts', false],
    ['src/*.ts', 'src/a\\b.ts', true],
    ['src/*.ts', 'src/a\n.ts', true],
    ['src/a?.ts', 'src/a\n.ts', true],
    ['src/**.ts', 'src/a.ts', true],
    ['src/**.ts', 'src/nested/a.ts', false],
    ['src/**', 'src/a.ts', true],
    ['src/**', 'src/x/y.ts', true],
    ['src/**', 'docs/a.md', false],
    ['src/a?.ts', 'src/ab.ts', true],
    ['src/a?.ts', 'src/a/b.ts', false],
    ['src/a?.ts', 'src/a😀.ts', true],
  ];
  for (const [pattern, path, want] of rows)
    assert.equal(matchesPathGlob(pattern, path), want, `${pattern} ~ ${JSON.stringify(path)}`);
});

test('matchesPathGlob: repeated globstars stay fast', () => {
  const pattern = '**/x/'.repeat(12) + '**/target.ts';
  const path = 'x/'.repeat(50) + 'other.ts';
  const t0 = performance.now();
  assert.equal(matchesPathGlob(pattern, path), false);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `took ${ms} ms`);
});

test('parseItem: checkbox items with -, * and + bullets and CRLF', () => {
  assert.deepEqual(parseItem('- [ ] 1.2 Write the thing'), { key: '1.2 Write the thing', ticked: false });
  assert.deepEqual(parseItem('  * [x] 1.2 Write the thing  \r'), { key: '1.2 Write the thing', ticked: true });
  assert.deepEqual(parseItem('+ [X] Done'), { key: 'Done', ticked: true });
  assert.equal(parseItem('1.2 Write the thing'), null);
  assert.equal(parseItem('- [?] odd'), null);
  assert.equal(parseItem('## 1. Work'), null);
});

test('itemCounts counts ticked and unticked per key', () => {
  const m = itemCounts('- [ ] A\n- [x] A\n- [ ] B\r\n');
  assert.deepEqual(m.get('A'), { ticked: 1, unticked: 1 });
  assert.deepEqual(m.get('B'), { ticked: 0, unticked: 1 });
});

test('detectTicks finds the tick in the Claude Code Edit fixture', () => {
  const t = fixture('claude/PostToolUse-Edit-tick.json').tool_response;
  const after = t.originalFile.replace(t.oldString, t.newString);
  assert.deepEqual(ticks(t.originalFile, after), ['1.2 Write the thing']);
});

test('detectTicks finds the tick in the OpenCode patch fixture', () => {
  const patch = fixture('opencode/execute.after-patch-tick.json').result.metadata.files[0].patch;
  const body = patch.split('\n').filter((l) => /^[ +-]/.test(l) && !/^(\+\+\+|---) /.test(l));
  const before = body
    .filter((l) => !l.startsWith('+'))
    .map((l) => l.slice(1))
    .join('\n');
  const after = body
    .filter((l) => !l.startsWith('-'))
    .map((l) => l.slice(1))
    .join('\n');
  assert.match(before, /- \[x\] 1\.1 Done already/);
  assert.match(after, /- \[x\] 1\.4 Also done/);
  assert.deepEqual(ticks(before, after), ['1.2 Write the thing']);
});

test('a moved and ticked item gives one tick', () => {
  const before = '- [ ] 1.1 A\n- [ ] 1.2 B\n- [ ] 1.3 C\n';
  const after = '- [ ] 1.1 A\n- [ ] 1.3 C\n\n## Later\n- [x] 1.2 B\n';
  assert.deepEqual(ticks(before, after), ['1.2 B']);
});

test('an added ticked item is not a tick', () => {
  assert.deepEqual(ticks('- [ ] 1.1 A\n', '- [ ] 1.1 A\n- [x] 9.9 New\n'), []);
});

test('a new file has no transition', () => {
  assert.deepEqual(detectTicks(undefined, itemCounts('- [x] 1.1 A\n')), []);
  assert.deepEqual(detectTicks(null, itemCounts('- [x] 1.1 A\n')), []);
});

test('reorder and duplicate labels give no tick', () => {
  const before = '- [ ] A\n- [x] B\n- [ ] A\n- [x] A\n';
  const after = '- [x] A\n- [ ] A\n- [x] B\n- [ ] A\n';
  assert.deepEqual(ticks(before, after), []);
});

test('duplicate labels: one more ticked and one fewer unticked is one tick', () => {
  assert.deepEqual(ticks('- [ ] A\n- [ ] A\n', '- [x] A\n- [ ] A\n'), ['A']);
  assert.deepEqual(ticks('- [ ] A\n- [ ] A\n', '- [x] A\n- [x] A\n'), ['A', 'A']);
});

test('CRLF and other bullets work', () => {
  assert.deepEqual(ticks('* [ ] 1.2 B\r\n+ [ ] 1.3 C\r\n', '* [x] 1.2 B\r\n+ [ ] 1.3 C\r\n'), ['1.2 B']);
  assert.deepEqual(ticks('- [ ] 1.2 B\n', '+ [x] 1.2 B\r\n'), ['1.2 B']);
});

test('swapping which of two identically labelled items is ticked is not detected (stated limit)', () => {
  assert.deepEqual(ticks('- [x] A\n- [ ] A\n', '- [ ] A\n- [x] A\n'), []);
});

test('an untick is not a tick', () => {
  assert.deepEqual(ticks('- [x] A\n', '- [ ] A\n'), []);
});

test('suppressSeen subtracts ticks recorded after the call began', () => {
  const callAt = 1_000_000;
  const snap = (at) => ({
    version: 1,
    files: { 'openspec/changes/x/tasks.md': { A: { ticked: 2, unticked: 0, ticks: at } } },
  });
  // One tick recorded after the call began (a child's), and the call saw two: one is its own.
  assert.deepEqual(suppressSeen(['A', 'A'], snap([callAt + 10]), callAt), ['A']);
  // The call saw one; the one recorded after it began is the same tick.
  assert.deepEqual(suppressSeen(['A'], snap([callAt + 10]), callAt), []);
  // A re-tick whose earlier tick was recorded before the call is reported.
  assert.deepEqual(suppressSeen(['A'], snap([callAt - 5000]), callAt), ['A']);
  // ISO timestamps work too, and other keys are untouched.
  assert.deepEqual(suppressSeen(['A', 'B'], snap([new Date(callAt + 1).toISOString()]), callAt), ['B']);
  // Restricting to one file.
  assert.deepEqual(suppressSeen(['A'], snap([callAt + 10]), callAt, 'other/tasks.md'), ['A']);
  assert.deepEqual(suppressSeen(['A'], snap([callAt + 10]), callAt, 'openspec/changes/x/tasks.md'), []);
  // No snapshot.
  assert.deepEqual(suppressSeen(['A'], null, callAt), ['A']);
});
