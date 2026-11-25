import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessConfig, SectionOptions, SectionResult } from './config.types.mts';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function readHarnessConfig(repoRoot: string): HarnessConfig {
  const file = join(repoRoot, '.agents', 'harness.json');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError(`cannot read ${file}: ${(err as Error).message}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`${file} is not valid JSON: ${(err as Error).message}`);
  }
  if (!isObject(value)) throw new ConfigError(`${file} must contain a JSON object`);
  return value;
}

export function loadSection<T extends Record<string, unknown> = Record<string, unknown>>(
  repoRoot: string,
  tool: string,
  { keys = [], required = [], defaults = {} }: SectionOptions = {},
): SectionResult<T> {
  const config = readHarnessConfig(repoRoot);
  const errors: string[] = [];
  let own: Record<string, unknown> = {};
  if (config[tool] !== undefined) {
    if (isObject(config[tool])) own = config[tool] as Record<string, unknown>;
    else errors.push(`"${tool}" must be an object`);
  }
  for (const key of Object.keys(own)) {
    if (!keys.includes(key)) errors.push(`unknown key "${key}" in "${tool}" (allowed: ${keys.join(', ')})`);
  }
  for (const key of required) {
    if (own[key] === undefined) errors.push(`missing required key "${key}" in "${tool}"`);
  }
  return { section: { ...defaults, ...own } as T, errors };
}
