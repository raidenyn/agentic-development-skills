// hooked-rules cli.mjs (design D7 pointers, D8 install/update/check), spawned against temp repos:
// the copied tool and its lock, the empty config section, the rules folder and the AGENTS.md block.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ASSETS, runNode, tempRepo } from './helpers.mjs';

const HR_CLI = join(ASSETS.hookedRules, 'cli.mjs');
const RT_CLI = join(ASSETS.hookRuntime, 'cli.mjs');
const HR_TOOL = '.agents/harness/hooked-rules';
const LOCK = '.agents/harness/lock.json';
const CONFIG = '.agents/harness.json';
const RULES = '.agents/hooked-rules';
const FIX = 'run: node .agents/harness/hooked-rules/cli.mjs pointers';

const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function repo(opts) {
  const r = await tempRepo(opts);
  cleanups.push(r.cleanup);
  return r;
}

const hr = (r, ...args) => runNode(HR_CLI, [...args, '--repo', r.dir], { cwd: r.dir });
const installedHr = (r, ...args) => runNode(join(r.dir, HR_TOOL, 'cli.mjs'), args, { cwd: r.dir });
const json = (r, rel) => JSON.parse(readFileSync(join(r.dir, rel), 'utf8'));
const read = (r, rel) => readFileSync(join(r.dir, rel), 'utf8');
const write = (r, rel, text) => {
  mkdirSync(dirname(join(r.dir, rel)), { recursive: true });
  writeFileSync(join(r.dir, rel), text);
};

// A valid rule file: `---` frontmatter with a pointer and a skill, then a body.
const rule = (pointer, frontmatter = 'skills: ["s"]', body = 'Body.\n') =>
  `---\npointer: "${pointer}"\n${frontmatter}\n---\n${body}`;

async function withRuntime(files) {
  const r = await repo({ files });
  const out = await runNode(RT_CLI, ['install', '--repo', r.dir], { cwd: r.dir });
  assert.equal(out.code, 0, out.stderr);
  return r;
}

const setLockVersion = (r, tool, version) => {
  const lock = json(r, LOCK);
  lock.tools[tool].version = version;
  write(r, LOCK, `${JSON.stringify(lock, null, 2)}\n`);
};

test('install: fresh install copies the tool, records the lock, adds the section and rules folder, and leaves host configs byte-identical', async () => {
  const r = await withRuntime();
  const claude = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"foreign-hook"}]}]}}\n';
  const opencode = '{"plugins":["./foreign-plugin"]}\n';
  write(r, '.claude/settings.json', claude);
  write(r, 'opencode.json', opencode);

  const out = await hr(r, 'install');
  assert.equal(out.code, 0, out.stderr);

  assert.ok(existsSync(join(r.dir, HR_TOOL, 'cli.mjs')));
  assert.ok(existsSync(join(r.dir, HR_TOOL, 'handler.mjs')));
  const entry = json(r, LOCK).tools['hooked-rules'];
  assert.equal(entry.version, '0.1.0');
  assert.ok(entry.files['cli.mjs']);
  assert.ok(entry.files['lib/pointers.mjs']);
  assert.deepEqual(json(r, CONFIG)['hooked-rules'], {});
  assert.ok(existsSync(join(r.dir, RULES)));
  assert.equal(read(r, '.claude/settings.json'), claude);
  assert.equal(read(r, 'opencode.json'), opencode);
});

test('install: a repeated install exits 0 and changes nothing', async () => {
  const r = await withRuntime();
  assert.equal((await hr(r, 'install')).code, 0);
  const before = {
    lock: read(r, LOCK),
    config: read(r, CONFIG),
    cli: read(r, `${HR_TOOL}/cli.mjs`),
    handler: read(r, `${HR_TOOL}/handler.mjs`),
  };

  const again = await hr(r, 'install');
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /is up to date/);
  assert.equal(read(r, LOCK), before.lock);
  assert.equal(read(r, CONFIG), before.config);
  assert.equal(read(r, `${HR_TOOL}/cli.mjs`), before.cli);
  assert.equal(read(r, `${HR_TOOL}/handler.mjs`), before.handler);
});

test('install: a lock with hook-runtime 0.1.6 refuses and changes nothing; check also fails', async () => {
  const r = await withRuntime();
  setLockVersion(r, 'hook-runtime', '0.1.6');
  const lockText = read(r, LOCK);

  const out = await hr(r, 'install');
  assert.equal(out.code, 1);
  assert.match(out.stderr, /hooked-rules needs agent-harness-hook-runtime 0\.2\.0 or newer; update it first\./);
  assert.equal(read(r, LOCK), lockText);
  assert.equal(existsSync(join(r.dir, HR_TOOL)), false);
  assert.equal(json(r, CONFIG)['hooked-rules'], undefined);

  const check = await hr(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /0\.2\.0 or newer/);
});

test('install: versions compare numerically on major.minor.patch (0.10.0 is newer than 0.2.0)', async () => {
  const r = await withRuntime();
  setLockVersion(r, 'hook-runtime', '0.10.0');
  const out = await hr(r, 'install');
  assert.equal(out.code, 0, out.stderr);
  assert.equal(json(r, LOCK).tools['hooked-rules'].version, '0.1.0');
});

test('install and update: a 0.0.9 lock entry makes install refuse with "use update" and update install 0.1.0', async () => {
  const r = await withRuntime();
  assert.equal((await hr(r, 'install')).code, 0);
  setLockVersion(r, 'hooked-rules', '0.0.9');

  const refused = await hr(r, 'install');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /hooked-rules 0\.0\.9 is installed; use update to install 0\.1\.0/);
  assert.equal(json(r, LOCK).tools['hooked-rules'].version, '0.0.9');

  const updated = await hr(r, 'update');
  assert.equal(updated.code, 0, updated.stderr);
  assert.equal(json(r, LOCK).tools['hooked-rules'].version, '0.1.0');
});

test('check and update: an edited copied file fails check with its path, and update refuses', async () => {
  const r = await withRuntime();
  assert.equal((await hr(r, 'install')).code, 0);
  appendFileSync(join(r.dir, HR_TOOL, 'handler.mjs'), '// edited\n');

  const check = await installedHr(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /handler\.mjs differs from the lock/);

  const updated = await hr(r, 'update');
  assert.equal(updated.code, 1);
  assert.match(updated.stderr, /handler\.mjs differs from the lock/);
  assert.match(updated.stderr, /git checkout --/);
  assert.match(read(r, `${HR_TOOL}/handler.mjs`), /\/\/ edited/);
});

test('pointers and pointers --check without AGENTS.md exit 1 with "cannot be read"', async () => {
  const r = await repo();
  for (const args of [['pointers'], ['pointers', '--check']]) {
    const out = await hr(r, ...args);
    assert.equal(out.code, 1, args.join(' '));
    assert.match(out.stderr, /AGENTS\.md cannot be read/);
  }
});

test('install, update and check: a key in the config section is refused and named', async () => {
  for (const mode of ['install', 'update']) {
    const r = await withRuntime();
    const config = json(r, CONFIG);
    config['hooked-rules'] = { x: 1 };
    write(r, CONFIG, `${JSON.stringify(config, null, 2)}\n`);

    const out = await hr(r, mode);
    assert.equal(out.code, 1, mode);
    assert.match(out.stderr, /unknown key "x" in "hooked-rules"/);
    assert.equal(json(r, LOCK).tools['hooked-rules'], undefined);
    assert.equal(existsSync(join(r.dir, HR_TOOL)), false);
  }

  const r = await withRuntime();
  const config = json(r, CONFIG);
  config['hooked-rules'] = { x: 1 };
  write(r, CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  const check = await hr(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /unknown key "x" in "hooked-rules"/);
});

test('check: an invalid rule file fails naming the file', async () => {
  const r = await withRuntime();
  assert.equal((await hr(r, 'install')).code, 0);
  write(r, `${RULES}/bad.md`, rule('p', 'when: "x"'));

  const check = await installedHr(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /\.agents\/hooked-rules\/bad\.md/);
  assert.match(check.stderr, /when/);
});

test('pointers appends the heading and block in name order; check passes; a pointer change fails with the fix line', async () => {
  const r = await repo({
    files: {
      'AGENTS.md': 'Intro\n',
      '.agents/hooked-rules/b.md': rule('second'),
      '.agents/hooked-rules/a.md': rule('first'),
    },
  });

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 0, out.stderr);
  const expected =
    'Intro\n\n' +
    '## Hook-delivered rules\n' +
    '<!-- hooked-rules:begin -->\n' +
    '- first \u2014 .agents/hooked-rules/a.md\n' +
    '- second \u2014 .agents/hooked-rules/b.md\n' +
    '<!-- hooked-rules:end -->\n';
  assert.equal(read(r, 'AGENTS.md'), expected);

  const ok = await hr(r, 'pointers', '--check');
  assert.equal(ok.code, 0, ok.stderr);

  write(r, '.agents/hooked-rules/b.md', rule('changed'));
  const stale = await hr(r, 'pointers', '--check');
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /stale/);
  assert.ok(stale.stderr.includes(FIX), stale.stderr);
  assert.equal(read(r, 'AGENTS.md'), expected);
});

test('pointers: duplicate markers fail and leave AGENTS.md unchanged; check fails too', async () => {
  const markers =
    '<!-- hooked-rules:begin -->\n' +
    '<!-- hooked-rules:end -->\n\n' +
    '<!-- hooked-rules:begin -->\n' +
    '<!-- hooked-rules:end -->\n';
  const r = await repo({ files: { 'AGENTS.md': markers } });

  for (const args of [['pointers'], ['pointers', '--check']]) {
    const out = await hr(r, ...args);
    assert.equal(out.code, 1, args.join(' '));
    assert.match(out.stderr, /exactly one hooked-rules begin line followed by one end line/);
    assert.equal(read(r, 'AGENTS.md'), markers);
  }
});

test('pointers: an invalid rule file exits 1 and names the file in write and check mode', async () => {
  const r = await repo({
    files: {
      'AGENTS.md': 'keep\n',
      '.agents/hooked-rules/bad.md': rule('p', 'when: "x"'),
    },
  });

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 1);
  assert.match(out.stderr, /\.agents\/hooked-rules\/bad\.md/);
  assert.match(out.stderr, /when/);
  assert.equal(read(r, 'AGENTS.md'), 'keep\n');

  const check = await hr(r, 'pointers', '--check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /\.agents\/hooked-rules\/bad\.md/);
  assert.match(check.stderr, /when/);
  assert.ok(check.stderr.includes(FIX), check.stderr);
  assert.equal(read(r, 'AGENTS.md'), 'keep\n');
});

test('install and check: a malformed hook-runtime version is refused instead of compared partially', async () => {
  for (const version of ['0.2junk.0', '0.3.invalid', '0.2']) {
    const r = await withRuntime();
    setLockVersion(r, 'hook-runtime', version);

    const out = await hr(r, 'install');
    assert.equal(out.code, 1, version);
    assert.match(out.stderr, /hooked-rules needs agent-harness-hook-runtime 0\.2\.0 or newer; update it first\./);
    assert.equal(json(r, LOCK).tools['hooked-rules'], undefined, version);

    const check = await hr(r, 'check');
    assert.equal(check.code, 1, version);
    assert.match(check.stderr, /0\.2\.0 or newer/, version);
  }
});

test('pointers: an undecodable AGENTS.md reports "cannot be read" and is left byte-identical', async () => {
  const r = await repo({ files: { '.agents/hooked-rules/a.md': rule('new') } });
  const valid = Buffer.from(
    'Intro\r\n\r\n' +
      '## Hook-delivered rules\r\n' +
      '<!-- hooked-rules:begin -->\r\n' +
      '- old \u2014 .agents/hooked-rules/a.md\r\n' +
      '<!-- hooked-rules:end -->\r\n\r\n' +
      'After\r\n',
    'utf8',
  );
  // 0xff is never valid UTF-8 and sits outside the block; a rewrite must not replace it.
  const bytes = Buffer.concat([valid, Buffer.from([0xff]), Buffer.from('tail\r\n')]);
  writeFileSync(join(r.dir, 'AGENTS.md'), bytes);

  for (const args of [['pointers'], ['pointers', '--check']]) {
    const out = await hr(r, ...args);
    assert.equal(out.code, 1, args.join(' '));
    assert.match(out.stderr, /AGENTS\.md cannot be read/);
    assert.ok(readFileSync(join(r.dir, 'AGENTS.md')).equals(bytes), 'the file is unchanged');
  }
});

test('check and pointers reject a rule file name containing a line break', async () => {
  const name = 'bad\nname.md';
  const r = await repo({
    files: {
      'AGENTS.md': 'keep\n',
      [`${RULES}/${name}`]: rule('p'),
    },
  });

  const check = await hr(r, 'check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /line break/);
  assert.match(check.stderr, /\.agents\/hooked-rules\/bad/);

  for (const args of [['pointers'], ['pointers', '--check']]) {
    const out = await hr(r, ...args);
    assert.equal(out.code, 1, args.join(' '));
    assert.match(out.stderr, /line break/);
    assert.match(out.stderr, /\.agents\/hooked-rules\/bad/);
    if (args.includes('--check')) assert.ok(out.stderr.includes(FIX), out.stderr);
    assert.equal(read(r, 'AGENTS.md'), 'keep\n');
  }
});

test('pointers: a missing heading fails check naming the heading, and pointers writes it right before the marker', async () => {
  const r = await repo({
    files: {
      'AGENTS.md':
        'before\n' +
        '<!-- hooked-rules:begin -->\n' +
        '- old \u2014 .agents/hooked-rules/a.md\n' +
        '<!-- hooked-rules:end -->\n',
      '.agents/hooked-rules/a.md': rule('new'),
    },
  });

  const check = await hr(r, 'pointers', '--check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /## Hook-delivered rules/);

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 0, out.stderr);
  assert.equal(
    read(r, 'AGENTS.md'),
    'before\n' +
      '## Hook-delivered rules\n' +
      '<!-- hooked-rules:begin -->\n' +
      '- new \u2014 .agents/hooked-rules/a.md\n' +
      '<!-- hooked-rules:end -->\n',
  );
});

test('pointers: a heading separated by a blank line fails check and pointers removes the blank line', async () => {
  const r = await repo({
    files: {
      'AGENTS.md':
        'before\n' +
        '## Hook-delivered rules\n' +
        '\n' +
        '<!-- hooked-rules:begin -->\n' +
        '<!-- hooked-rules:end -->\n',
    },
  });

  const check = await hr(r, 'pointers', '--check');
  assert.equal(check.code, 1);
  assert.match(check.stderr, /## Hook-delivered rules/);

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 0, out.stderr);
  const expected =
    'before\n' + '## Hook-delivered rules\n' + '<!-- hooked-rules:begin -->\n' + '<!-- hooked-rules:end -->\n';
  assert.equal(read(r, 'AGENTS.md'), expected);

  const ok = await hr(r, 'pointers', '--check');
  assert.equal(ok.code, 0, ok.stderr);
});

test('pointers: a current block right under its heading is left byte-identical', async () => {
  const text =
    'Intro\n\n' +
    '## Hook-delivered rules\n' +
    '<!-- hooked-rules:begin -->\n' +
    '- p \u2014 .agents/hooked-rules/a.md\n' +
    '<!-- hooked-rules:end -->\n\n' +
    'After\n';
  const r = await repo({ files: { 'AGENTS.md': text, '.agents/hooked-rules/a.md': rule('p') } });

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 0, out.stderr);
  assert.equal(read(r, 'AGENTS.md'), text);
  const check = await hr(r, 'pointers', '--check');
  assert.equal(check.code, 0, check.stderr);
});

test('pointers: a CRLF AGENTS.md keeps CRLF and leaves the bytes outside the block unchanged', async () => {
  const text =
    'Intro\r\n\r\n' +
    '## Hook-delivered rules\r\n' +
    '<!-- hooked-rules:begin -->\r\n' +
    '- old \u2014 .agents/hooked-rules/a.md\r\n' +
    '<!-- hooked-rules:end -->\r\n\r\n' +
    'After\r\n';
  const r = await repo({ files: { 'AGENTS.md': text, '.agents/hooked-rules/a.md': rule('new') } });

  const out = await hr(r, 'pointers');
  assert.equal(out.code, 0, out.stderr);
  const updated = read(r, 'AGENTS.md');
  assert.equal(
    updated,
    'Intro\r\n\r\n' +
      '## Hook-delivered rules\r\n' +
      '<!-- hooked-rules:begin -->\r\n' +
      '- new \u2014 .agents/hooked-rules/a.md\r\n' +
      '<!-- hooked-rules:end -->\r\n\r\n' +
      'After\r\n',
  );
  assert.ok(!/(?<!\r)\n/.test(updated), 'no bare LF is written');
  assert.ok(updated.startsWith('Intro\r\n\r\n'));
  assert.ok(updated.endsWith('\r\n\r\nAfter\r\n'));

  const check = await hr(r, 'pointers', '--check');
  assert.equal(check.code, 0, check.stderr);
});
