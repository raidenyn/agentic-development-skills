// The hooked-rule grammar (design D3): a line-by-line port of veles's scripts/agent_rules.py.
// A rule file is `---` frontmatter with a double-quoted `pointer` and flow or block lists of
// double-quoted strings, then a body.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ASSETS, tempRepo } from './helpers.mjs';

const { parseRule, loadRules, ruleText, RuleError, RULES_DIR, BODY_LIMIT, RULE_FILE_LIMIT } = await import(
  pathToFileURL(join(ASSETS.hookedRules, 'lib', 'rules.mjs')).href
);

const rule = (frontmatter, body = 'Rule body.\n') => `---\n${frontmatter}\n---\n${body}`;

const errorOf = (text) => {
  try {
    parseRule('a.md', text);
  } catch (err) {
    assert.ok(err instanceof RuleError, `expected a RuleError, got ${err}`);
    return err.message;
  }
  assert.fail('expected the rule to be rejected');
};

const errorFor = (frontmatter, body) => errorOf(rule(frontmatter, body));

test("the exported limits and folder are veles's", () => {
  assert.equal(RULES_DIR, '.agents/hooked-rules');
  assert.equal(BODY_LIMIT, 4096);
  assert.equal(RULE_FILE_LIMIT, 65536);
});

test('a rule with only a pointer and no entries is an error', () => {
  assert.match(errorFor('pointer: "read me"'), /at least one entry/);
});

test('pointer is required and must be a non-empty double-quoted string', () => {
  assert.match(errorFor('skills: ["a"]'), /pointer.*required/);
  assert.match(errorFor('pointer: ""\nskills: ["a"]'), /pointer.*empty/);
  assert.match(errorFor('pointer: "  "\nskills: ["a"]'), /pointer.*empty/);
});

test('Pattern.source is the written pattern, not RegExp.source', () => {
  const parsed = parseRule('a.md', rule('pointer: "p"\ncommands: ["a/b"]'));
  assert.equal(parsed.commands.length, 1);
  assert.equal(parsed.commands[0].source, 'a/b');
  assert.notEqual(parsed.commands[0].regex.source, parsed.commands[0].source, 'RegExp.source escapes /');
  assert.ok(parsed.commands[0].regex.test('a/b'));
  assert.equal(parsed.commands[0].regex.flags, 'u');
});

test('flow and block lists give equal skills', () => {
  const flow = parseRule('flow.md', rule('pointer: "p"\nskills: ["a", "b"]'));
  const block = parseRule('block.md', rule('pointer: "p"\nskills:\n  - "a"\n  - "b"'));
  assert.deepEqual(flow.skills, ['a', 'b']);
  assert.deepEqual(block.skills, flow.skills);
});

test('BOM and CRLF parse, the body has LF, and loadRules hashes the raw file bytes', async () => {
  const text = '\uFEFF---\r\npointer: "p"\r\nskills: ["a"]\r\n---\r\nThe body.\r\nTwo lines.\r\n';
  const r = await tempRepo();
  try {
    await mkdir(join(r.dir, RULES_DIR), { recursive: true });
    await writeFile(join(r.dir, RULES_DIR, 'bom.md'), text);
    const { rules, errors } = loadRules(r.dir);
    assert.deepEqual(errors, []);
    assert.equal(rules.length, 1);
    const [parsed] = rules;
    assert.deepEqual(parsed.skills, ['a']);
    assert.equal(parsed.body, 'The body.\nTwo lines.\n');
    assert.equal(parsed.sha256, createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'));
    assert.equal(parsed.name, 'bom.md');
  } finally {
    await r.cleanup();
  }
});

test('lone CR line endings parse too', () => {
  const parsed = parseRule('cr.md', '---\rpointer: "p"\rskills: ["a"]\r---\rBody.\r');
  assert.equal(parsed.body, 'Body.\n');
});

test('an unknown key names the key in the error', () => {
  assert.match(errorFor('pointer: "p"\nskills: ["a"]\nwhen: "x"'), /when/);
});

test('U+2028 and U+2029 inside quoted values are text, not line endings', () => {
  const parsed = parseRule('u.md', rule('pointer: "p\u2028q"\nskills: ["a\u2028b", "c\u2029d"]'));
  assert.equal(parsed.pointer, 'p\u2028q');
  assert.deepEqual(parsed.skills, ['a\u2028b', 'c\u2029d']);
});

test('a symlinked or non-regular rule file is an error and is not read', async () => {
  const r = await tempRepo();
  try {
    await r.write('target.md', rule('pointer: "p"\nskills: ["a"]'));
    await mkdir(join(r.dir, RULES_DIR), { recursive: true });
    await symlink('../../target.md', join(r.dir, RULES_DIR, 'link.md'));
    await mkdir(join(r.dir, RULES_DIR, 'dir.md'));
    const { rules, errors } = loadRules(r.dir);
    assert.deepEqual(rules, []);
    assert.deepEqual(
      errors.map((e) => e.path),
      [`${RULES_DIR}/dir.md`, `${RULES_DIR}/link.md`],
    );
    assert.match(errors[0].message, /not a regular file/);
    assert.match(errors[1].message, /symlink/);
  } finally {
    await r.cleanup();
  }
});

test('a 4097-byte body errors naming the 4096 limit', () => {
  const message = errorFor('pointer: "p"\nskills: ["a"]', 'x'.repeat(BODY_LIMIT + 1));
  assert.match(message, /4097 bytes/);
  assert.match(message, /4096/);
});

test('the body cap counts bytes before CRLF is normalised', () => {
  const body = `${Array.from({ length: 200 }, () => 'x'.repeat(19)).join('\r\n')}\r\n`;
  assert.equal(body.replace(/\r\n/g, '\n').length, 4000);
  assert.equal(Buffer.byteLength(body), 4200);
  const text = `---\r\npointer: "p"\r\nskills: ["a"]\r\n---\r\n${body}`;
  const message = errorOf(text);
  assert.match(message, /4200 bytes/);
  assert.match(message, /4096/);
});

test('frontmatter and body errors', () => {
  const cases = [
    ['an empty body', rule('pointer: "p"\nskills: ["a"]', '')],
    ['a blank body', rule('pointer: "p"\nskills: ["a"]', '\n \n')],
    ['an empty list', rule('pointer: "p"\nskills: []')],
    ['a tab', rule('pointer:\t"p"\nskills: ["a"]')],
    ['a trailing tab', rule('pointer: "p"\t\nskills: ["a"]')],
    ['a tab in a block item', rule('pointer: "p"\nskills:\n  - "a\tb"')],
    ['an indented line', rule('pointer: "p"\nskills: ["a"]\n  nested: "x"')],
    ['a duplicate key', rule('pointer: "p"\nskills: ["a"]\nskills: ["b"]')],
    ['the \\n escape', rule('pointer: "p"\nskills: ["a\\nb"]')],
    ['a missing closing marker', '---\npointer: "p"\nskills: ["a"]\n'],
    ['a plain scalar pointer', rule('pointer: p\nskills: ["a"]')],
    ['a tab on the opening marker', '---\t\npointer: "p"\nskills: ["a"]\n---\nBody.\n'],
    ['a tab on the closing marker', '---\npointer: "p"\nskills: ["a"]\n---\t\nBody.\n'],
  ];
  for (const [label, text] of cases) {
    assert.throws(() => parseRule('a.md', text), RuleError, label);
  }
});

test('requires, exempt and stops are not supported in hooked-rules 0.1.0', () => {
  const frontmatter = (key, value) => `pointer: "p"\ngates: ["\\\\bgit\\\\s+push\\\\b"]\n${key}: ${value}`;
  for (const [key, value] of [
    ['requires', '["verify-pass"]'],
    ['exempt', '["x"]'],
    ['stops', '["superspec-finalize-pending"]'],
  ]) {
    assert.equal(errorFor(frontmatter(key, value)), `\`${key}\` is not supported by hooked-rules 0.1.0`);
  }
  assert.equal(
    errorFor('pointer: "p"\nstops: ["superspec-finalize-pending"]'),
    '`stops` is not supported by hooked-rules 0.1.0',
    'the unsupported key comes before the missing-entry check',
  );
});

test('an invalid regex names its key', () => {
  const message = errorFor('pointer: "p"\ncommands: ["("]');
  assert.match(message, /commands/);
  assert.match(message, /invalid regex/);
  assert.match(errorFor('pointer: "p"\ngates: ["["]'), /gates/);
});

test("veles's commit-types gates compile, stop at ; and newlines, and keep the grep false positive", () => {
  const parsed = parseRule(
    'commit.md',
    rule(String.raw`pointer: "p"
gates: ["\\bgit\\b[^;&|\\n]*?\\scommit\\b", "\\bgh\\s+pr\\s+(create|edit)\\b"]`),
  );
  assert.deepEqual(
    parsed.gates.map((gate) => gate.source),
    [String.raw`\bgit\b[^;&|\n]*?\scommit\b`, String.raw`\bgh\s+pr\s+(create|edit)\b`],
  );
  const [commit, pullRequest] = parsed.gates;
  assert.equal(commit.regex.test('git -C x commit -m y'), true);
  assert.equal(commit.regex.test('echo git; commit'), false);
  assert.equal(commit.regex.test('git log\nsay commit'), false, 'the separator class stops at a newline');
  assert.equal(commit.regex.test('git log --grep commit'), true, 'a known veles false positive, kept on purpose');
  assert.equal(pullRequest.regex.test('gh pr create --title x'), true);
  assert.equal(pullRequest.regex.test('gh pr edit 5 --body y'), true);
  assert.equal(pullRequest.regex.test('gh pr list'), false);
});

test('loadRules returns valid rules next to the errors of invalid ones, in file-name order', async () => {
  const r = await tempRepo({
    files: {
      [`${RULES_DIR}/b.md`]: rule('pointer: "p"\nskills: ["b"]'),
      [`${RULES_DIR}/a.md`]: rule('pointer: "p"\nskills: ["a"]'),
      [`${RULES_DIR}/c.md`]: rule('pointer: "p"\nskills: ["a"]\nwhen: "x"'),
      [`${RULES_DIR}/notes.txt`]: 'not a rule\n',
    },
  });
  try {
    const { rules, errors } = loadRules(r.dir);
    assert.deepEqual(
      rules.map((item) => item.name),
      ['a.md', 'b.md'],
    );
    assert.equal(rules[0].sha256.length, 64);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].path, `${RULES_DIR}/c.md`);
    assert.match(errors[0].message, /when/);
  } finally {
    await r.cleanup();
  }
});

test('loadRules on a repo without the rules folder returns no rules and no errors', async () => {
  const r = await tempRepo();
  try {
    assert.deepEqual(loadRules(r.dir), { rules: [], errors: [] });
  } finally {
    await r.cleanup();
  }
});

test('loadRules treats a regular file at the rules path as a folder failure, not an absent folder', async () => {
  const r = await tempRepo();
  try {
    await mkdir(join(r.dir, '.agents'), { recursive: true });
    await writeFile(join(r.dir, RULES_DIR), 'not a directory\n');
    const { rules, errors } = loadRules(r.dir);
    assert.deepEqual(rules, []);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].path, RULES_DIR);
    assert.equal(errors[0].directory, true);
    assert.match(errors[0].message, /not a directory/);
  } finally {
    await r.cleanup();
  }
});

test('loadRules reports a file over 65536 bytes and one that is not UTF-8', async () => {
  const r = await tempRepo({
    files: {
      [`${RULES_DIR}/big.md`]: `${rule('pointer: "p"\nskills: ["a"]')}${'x'.repeat(RULE_FILE_LIMIT)}`,
      [`${RULES_DIR}/bad.md`]: Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]),
    },
  });
  try {
    const { rules, errors } = loadRules(r.dir);
    assert.deepEqual(rules, []);
    assert.deepEqual(
      errors.map((e) => e.path),
      [`${RULES_DIR}/bad.md`, `${RULES_DIR}/big.md`],
    );
    assert.match(errors[0].message, /not valid UTF-8/);
    assert.match(errors[1].message, /larger than 65536 bytes/);
  } finally {
    await r.cleanup();
  }
});

test('ruleText removes only leading and trailing blank lines', () => {
  assert.equal(ruleText('\n \nBody\n  indented  \n\n'), 'Body\n  indented  ');
  assert.equal(ruleText('\n\n'), '');
});
