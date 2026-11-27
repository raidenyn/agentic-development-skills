// Generated from src/hooked-rules/lib/rules.mts by scripts/build.mts. Do not edit.
// The hooked-rule grammar (design D3, ported line by line from veles's scripts/agent_rules.py):
// `---` frontmatter with a double-quoted `pointer` and the lists `skills`, `commands`, `gates`,
// `stops`, `requires` and `exempt`, then a body.
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RULES_DIR = '.agents/hooked-rules';
export const BODY_LIMIT = 4096;
// The most bytes read from one rule file; a larger file is an error. A valid rule is far smaller
// (the body cap plus its frontmatter), so the cap only bounds what a damaged file can cost.
export const RULE_FILE_LIMIT = 65536;

export class RuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleError';
  }
}

const SCALAR_KEYS = ['pointer'];
const LIST_KEYS = ['skills', 'commands', 'gates', 'stops', 'requires', 'exempt'];
const RULE_KEYS = new Set([...SCALAR_KEYS, ...LIST_KEYS]);
// The scope rejections for this version; #17 and #18 replace them with veles's checks.
const UNSUPPORTED_KEYS = ['requires', 'exempt', 'stops'];

const FRONTMATTER_KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):(?: ([\s\S]*))?$/;
const FRONTMATTER_ITEM = '"(?:[^"\\\\]|\\\\.)*"';
const FRONTMATTER_QUOTED_RE = new RegExp(`^${FRONTMATTER_ITEM}$`);
const FRONTMATTER_FLOW_RE = new RegExp(`^\\[(${FRONTMATTER_ITEM}(?:, ${FRONTMATTER_ITEM})*)\\]$`);
const FRONTMATTER_BLOCK_RE = new RegExp(`^  - (${FRONTMATTER_ITEM})$`);
const FRONTMATTER_ITEM_RE = new RegExp(FRONTMATTER_ITEM, 'g');

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

// Decode one double-quoted string, accepting only the \" and \\ escapes.
function quoted(item) {
  const body = item.slice(1, -1);
  let decoded = '';
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '\\') {
      const escaped = body[index + 1];
      if (escaped !== '"' && escaped !== '\\') throw new RuleError(`unsupported escape sequence \\${escaped}`);
      decoded += escaped;
      index += 1;
    } else {
      decoded += character;
    }
  }
  return decoded;
}

// A one-line list of double-quoted strings, for example ["a", "b"].
function flow(value) {
  if (value === '[]') throw new RuleError('a list must hold at least one item');
  const match = FRONTMATTER_FLOW_RE.exec(value);
  if (match === null)
    throw new RuleError(`a list must be written as double-quoted strings, got ${JSON.stringify(value)}`);
  return [...match[1].matchAll(FRONTMATTER_ITEM_RE)].map((item) => quoted(item[0]));
}

// A double-quoted scalar; plain scalars are outside the hooked-rule grammar.
function scalar(key, value) {
  if (value === null || !FRONTMATTER_QUOTED_RE.test(value))
    throw new RuleError(
      `\`${key}\` must be a double-quoted string, got ${value === null ? 'nothing' : JSON.stringify(value)}`,
    );
  return quoted(value);
}

// The text may use CRLF or a lone CR and start with a UTF-8 BOM. The body is everything after the
// closing `---` line with LF line endings; originalBody is the same text before normalisation, which
// is what the size cap counts.
function split(text) {
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  const pieces = text.split(/(\r\n|\r|\n)/); // line, terminator, line, terminator, ..., line
  const lines = pieces.filter((_, index) => index % 2 === 0);
  let start = null;
  for (const [index, line] of lines.entries()) {
    if (line.trimEnd() !== '') {
      start = index;
      break;
    }
  }
  if (start === null || lines[start].trimEnd() !== '---')
    throw new RuleError('frontmatter must start with a `---` line');

  const values = new Map();
  let blockKey = null;
  let block = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trimEnd();
    if (line === '---') {
      if (blockKey !== null && block !== null && block.length === 0)
        throw new RuleError(`\`${blockKey}\` has no list items`);
      return {
        values,
        body: lines.slice(index + 1).join('\n'),
        originalBody: pieces.slice(2 * index + 2).join(''),
      };
    }
    // A tab anywhere on a frontmatter line is an error, including one a trailing trim would hide
    // and one inside a block-list item.
    if (raw.includes('\t')) throw new RuleError(`tabs are not allowed in frontmatter: ${JSON.stringify(raw)}`);
    if (blockKey !== null && block !== null) {
      const item = FRONTMATTER_BLOCK_RE.exec(line);
      if (item !== null) {
        block.push(quoted(item[1]));
        continue;
      }
      if (block.length === 0) throw new RuleError(`\`${blockKey}\` has no list items`);
      blockKey = null;
      block = null;
    }
    if (line === '') continue;
    if (line.startsWith(' '))
      throw new RuleError(`nested mappings and indentation are not supported: ${JSON.stringify(line)}`);
    const match = FRONTMATTER_KEY_RE.exec(line);
    if (match === null)
      throw new RuleError(`expected \`key: value\` or \`key:\` in frontmatter: ${JSON.stringify(line)}`);
    const key = match[1];
    const value = match[2] ?? null;
    if (!RULE_KEYS.has(key)) throw new RuleError(`unsupported frontmatter key ${JSON.stringify(key)}`);
    if (values.has(key)) throw new RuleError(`duplicate frontmatter key ${JSON.stringify(key)}`);
    if (SCALAR_KEYS.includes(key)) {
      values.set(key, scalar(key, value));
    } else if (value === null) {
      block = [];
      blockKey = key;
      values.set(key, block);
    } else if (value.startsWith('[')) {
      values.set(key, flow(value));
    } else {
      throw new RuleError(`\`${key}\` must be a list of double-quoted strings, got ${JSON.stringify(value)}`);
    }
  }
  throw new RuleError('frontmatter is missing its closing `---` line');
}

function patterns(key, sources) {
  return sources.map((source) => {
    try {
      return { source, regex: new RegExp(source, 'u') };
    } catch (error) {
      throw new RuleError(
        `\`${key}\` holds an invalid regex ${JSON.stringify(source.slice(0, 80))}: ${messageOf(error)}`,
      );
    }
  });
}

const listValue = (values, key) => {
  const value = values.get(key);
  return Array.isArray(value) ? value : [];
};

/** Parse one hooked rule file's text into a Rule, or throw RuleError. */
export function parseRule(name, text) {
  const { values, body, originalBody } = split(text);
  const pointer = values.get('pointer');
  if (pointer === undefined) throw new RuleError('`pointer` is required');
  if (!pointer.trim()) throw new RuleError('`pointer` must not be empty');
  for (const key of UNSUPPORTED_KEYS) {
    if (values.has(key)) throw new RuleError(`\`${key}\` is not supported by hooked-rules 0.1.0`);
  }
  const skills = listValue(values, 'skills');
  const commands = patterns('commands', listValue(values, 'commands'));
  const gates = patterns('gates', listValue(values, 'gates'));
  if (skills.length === 0 && commands.length === 0 && gates.length === 0) {
    throw new RuleError('a rule needs at least one entry in `skills`, `commands`, `gates` or `stops`');
  }
  const size = Buffer.byteLength(originalBody, 'utf8');
  if (size > BODY_LIMIT) throw new RuleError(`the body is ${size} bytes, over the ${BODY_LIMIT} byte limit`);
  if (!ruleText(body)) throw new RuleError('the body is empty; a rule needs text to show at its moments and gates');
  return {
    name,
    sha256: createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
    pointer: pointer,
    skills,
    commands,
    gates,
    body,
  };
}

/** The rule's text: its body without leading or trailing blank lines. */
export function ruleText(body) {
  const lines = body.split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

// The bytes of the regular file at path, read without following a symlink; RuleError otherwise.
function readRuleFile(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    throw new RuleError(`cannot be read: ${messageOf(error)}`);
  }
  if (stats.isSymbolicLink()) throw new RuleError('is a symlink; hooked rules are regular files');
  if (!stats.isFile()) throw new RuleError('is not a regular file; hooked rules are regular files');
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
  let fd;
  try {
    fd = openSync(path, flags);
  } catch (error) {
    throw new RuleError(`cannot be read: ${messageOf(error)}`);
  }
  try {
    if (!fstatSync(fd).isFile()) throw new RuleError('is not a regular file; hooked rules are regular files');
    const chunks = [];
    const buffer = Buffer.alloc(RULE_FILE_LIMIT + 1);
    let size = 0;
    while (size <= RULE_FILE_LIMIT) {
      const read = readSync(fd, buffer, 0, RULE_FILE_LIMIT + 1 - size, null);
      if (read === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, read)));
      size += read;
    }
    if (size > RULE_FILE_LIMIT) throw new RuleError(`is larger than ${RULE_FILE_LIMIT} bytes`);
    return Buffer.concat(chunks);
  } finally {
    closeSync(fd);
  }
}

/** The rules of repoRoot's hooked-rules folder, sorted by name, with one error per invalid file. */
export function loadRules(repoRoot) {
  const directory = join(repoRoot, RULES_DIR);
  const rules = [];
  const errors = [];
  let names;
  try {
    if (!statSync(directory).isDirectory()) return { rules, errors };
    names = readdirSync(directory);
  } catch (error) {
    const code = error.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { rules, errors };
    errors.push({ path: RULES_DIR, message: `cannot be read: ${messageOf(error)}` });
    return { rules, errors };
  }
  names.sort();
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const relative = `${RULES_DIR}/${name}`;
    // A name with a line break cannot be one pointer-block line; reject it like any invalid rule.
    if (name.includes('\n') || name.includes('\r')) {
      errors.push({
        path: relative,
        message: 'its file name contains a line break, which the AGENTS.md pointer block cannot represent',
      });
      continue;
    }
    try {
      const raw = readRuleFile(join(directory, name));
      let text;
      try {
        text = decoder.decode(raw);
      } catch (error) {
        errors.push({ path: relative, message: `is not valid UTF-8: ${messageOf(error)}` });
        continue;
      }
      rules.push(parseRule(name, text));
    } catch (error) {
      if (error instanceof RuleError) errors.push({ path: relative, message: error.message });
      else errors.push({ path: relative, message: `cannot be read: ${messageOf(error)}` });
    }
  }
  return { rules, errors };
}
