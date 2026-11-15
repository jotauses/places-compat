import type { AllowEntry, Trace, TraceEntry } from './types';

export interface TraceDiff {
  step: number;
  path: string;
  original: unknown;
  replacement: unknown;
}

const FIELDS = ['step', 'label', 'settled', 'loading', 'callbacks', 'console'] as const;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  if (IDENTIFIER.test(key)) return base === '' ? key : `${base}.${key}`;
  return `${base}[${JSON.stringify(key)}]`;
}

function kind(value: unknown): 'array' | 'object' | 'value' {
  if (Array.isArray(value)) return 'array';
  return typeof value === 'object' && value !== null ? 'object' : 'value';
}

function diffValues(
  step: number,
  path: string,
  original: unknown,
  replacement: unknown,
  out: TraceDiff[],
): void {
  const shape = kind(original);
  if (shape !== kind(replacement)) {
    out.push({ step, path, original, replacement });
    return;
  }
  if (shape === 'array') {
    const left = original as unknown[];
    const right = replacement as unknown[];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
      diffValues(step, joinPath(path, index), left[index], right[index], out);
    }
    return;
  }
  if (shape === 'object') {
    const left = original as Record<string, unknown>;
    const right = replacement as Record<string, unknown>;
    const keys = [...Object.keys(left)];
    for (const key of Object.keys(right)) if (!keys.includes(key)) keys.push(key);
    for (const key of keys) {
      const has = (side: object) => Object.keys(side).includes(key);
      diffValues(
        step,
        joinPath(path, key),
        has(left) ? left[key] : undefined,
        has(right) ? right[key] : undefined,
        out,
      );
    }
    return;
  }
  if (!Object.is(original, replacement)) out.push({ step, path, original, replacement });
}

function allows(entry: AllowEntry, path: string): boolean {
  if (typeof entry.path === 'string') return entry.path === path;
  entry.path.lastIndex = 0;
  return entry.path.test(path);
}

export function compareTraces(
  original: Trace,
  replacement: Trace,
  allow: AllowEntry[],
): { diffs: TraceDiff[]; unusedAllow: AllowEntry[] } {
  const all: TraceDiff[] = [];
  const length = Math.max(original.length, replacement.length);
  for (let index = 0; index < length; index++) {
    const left: TraceEntry | undefined = original[index];
    const right: TraceEntry | undefined = replacement[index];
    const step = left?.step ?? right?.step ?? index;
    if (!left || !right) {
      all.push({ step, path: '', original: left, replacement: right });
      continue;
    }
    for (const field of FIELDS) diffValues(step, field, left[field], right[field], all);
  }
  const diffs = all.filter((diff) => !allow.some((entry) => allows(entry, diff.path)));
  const unusedAllow = allow.filter((entry) => !all.some((diff) => allows(entry, diff.path)));
  return { diffs, unusedAllow };
}
