// Generated from src/hooked-rules/lib/pointers.mts by scripts/build.mts. Do not edit.
// The AGENTS.md pointer block (design D7), ported line by line from veles's scripts/agent_rules.py:
// render_pointer_block, _locate_block, _apply_block and _line_ending, with heading_ok folded into
// locateBlock.
import { RuleError, RULES_DIR } from './rules.mjs';

export const POINTER_HEADING = '## Hook-delivered rules';
export const POINTER_BEGIN = '<!-- hooked-rules:begin -->';
export const POINTER_END = '<!-- hooked-rules:end -->';

const LINE_BREAK_RE = /(\r\n|\r|\n)/;

/** The generated block, markers included: one line per rule in name order and nothing else. */
export function renderBlock(rules) {
  const lines = [POINTER_BEGIN];
  for (const rule of [...rules].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (rule.name.includes('\n') || rule.name.includes('\r'))
      throw new RuleError(
        `the rule file name ${JSON.stringify(`${RULES_DIR}/${rule.name}`)} contains a line break, which the pointer block cannot represent`,
      );
    lines.push(`- ${rule.pointer} \u2014 ${RULES_DIR}/${rule.name}`);
  }
  lines.push(POINTER_END);
  for (const line of lines.slice(1, -1)) {
    if (line === POINTER_BEGIN || line === POINTER_END)
      throw new RuleError('a pointer line must not equal a hooked-rules marker line');
  }
  return lines.join('\n');
}

/** The first line ending of text, the style a rewrite keeps; LF for a file without one. */
export function lineEnding(text) {
  const match = LINE_BREAK_RE.exec(text);
  return match ? match[1] : '\n';
}

/** text with every line ending turned into LF. */
export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Find the block in text by its standalone marker lines, or null when absent. Throws on any other layout. */
export function locateBlock(text) {
  const pieces = text.split(LINE_BREAK_RE); // line, break, line, break, ..., line
  const lines = [];
  let position = 0;
  for (let index = 0; index < pieces.length; index += 2) {
    lines.push({ start: position, content: pieces[index] });
    position += pieces[index].length + (index + 1 < pieces.length ? pieces[index + 1].length : 0);
  }
  const begins = [];
  const ends = [];
  for (const [index, line] of lines.entries()) {
    if (line.content === POINTER_BEGIN) begins.push(index);
    else if (line.content === POINTER_END) ends.push(index);
  }
  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0])
    throw new RuleError('AGENTS.md must hold exactly one hooked-rules begin line followed by one end line');
  const begin = begins[0];
  const end = ends[0];
  let previous = begin - 1;
  while (previous >= 0 && lines[previous].content.trim() === '') previous -= 1;
  const heading = previous >= 0 && lines[previous].content === POINTER_HEADING ? lines[previous].start : null;
  const headingOk = heading !== null && previous === begin - 1;
  const endLine = lines[end];
  return {
    begin: lines[begin].start,
    end: endLine.start + endLine.content.length,
    headingOk,
    heading,
  };
}

/**
 * text with the block replaced between its markers, or appended under its heading. A block that is
 * already current right under its heading leaves the text untouched; blank lines between the heading
 * and the begin marker are removed, and a missing heading is written back in front of the begin
 * marker. When the heading already sits right above the marker, everything through the begin marker
 * line is kept byte for byte, so a mixed-line-ending file does not have its heading rewritten.
 */
export function applyBlock(text, block) {
  const location = locateBlock(text);
  const eol = lineEnding(text);
  if (location === null) {
    const separator = !text || text.endsWith(eol + eol) ? '' : text.endsWith(eol) ? eol : eol + eol;
    return `${text}${separator}${POINTER_HEADING}${eol}${block.replace(/\n/g, eol)}${eol}`;
  }
  if (location.headingOk && normalizeLineEndings(text.slice(location.begin, location.end)) === block) return text;
  if (location.headingOk) {
    const afterBegin = text.slice(location.begin + POINTER_BEGIN.length);
    const breakMatch = LINE_BREAK_RE.exec(afterBegin);
    const prefixEnd = location.begin + POINTER_BEGIN.length + (breakMatch?.index === 0 ? breakMatch[0].length : 0);
    return `${text.slice(0, prefixEnd)}${block.split('\n').slice(1).join(eol)}${text.slice(location.end)}`;
  }
  const start = location.heading === null ? location.begin : location.heading;
  return `${text.slice(0, start)}${POINTER_HEADING}${eol}${block.replace(/\n/g, eol)}${text.slice(location.end)}`;
}
