/// <reference path="./aliases.d.ts" />
import type { Step } from '../types';

export function unwrapModule<T>(mod: unknown): T {
  let current = mod as Record<string, unknown>;
  for (let depth = 0; depth < 3; depth++) {
    const inner = current?.default;
    if (typeof inner !== 'object' || inner === null) break;
    const own = (key: string) => Object.getOwnPropertyNames(inner).includes(key);
    if (!own('default') && !own('__esModule')) break;
    current = inner as Record<string, unknown>;
  }
  return current as T;
}

export function moduleExport<F>(mod: unknown, name: string, subject: string): F {
  const value = unwrapModule<Record<string, unknown>>(mod)?.[name];
  if (typeof value !== 'function')
    throw new Error(`${subject}: the module has no function "${name}"`);
  return value as F;
}

export type CallbackLog = { name: string; args: unknown[] }[];

export class Recorder<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  drain(): T[] {
    return this.items.splice(0);
  }
}

export function notApplicable(step: Step, subject: string): Error {
  return new Error(`step ${step.type} does not apply to ${subject}`);
}

export function unknownCall(name: string, subject: string): Error {
  return new Error(`call ${name} does not apply to ${subject}`);
}

export function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

export function readStorage(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
