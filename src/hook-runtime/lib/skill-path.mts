// A skill file read (design D1): the skill's name when a path, resolved against a base folder, has a
// real path ending in /skills/<name>/SKILL.md. Never throws; the cost of a plain read stays at zero
// syscalls, because only a path whose text ends in SKILL.md is resolved.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const SKILL_FILE = /\/skills\/([^/]+)\/SKILL\.md$/;

const slashes = (path: string): string => path.replace(/\\/g, '/');

export function skillFromPath(path: unknown, base: string): string | null {
  if (typeof path !== 'string') return null;
  const normalized = slashes(path);
  if (!normalized.endsWith('SKILL.md')) return null;
  let real: string;
  try {
    real = slashes(realpathSync(resolve(base, normalized)));
  } catch {
    return null;
  }
  return SKILL_FILE.exec(real)?.[1] ?? null;
}
