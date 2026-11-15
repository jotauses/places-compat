export const UNDEFINED = '[undefined]';

type Dict = Record<string, unknown>;

function isObject(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null;
}

function isElement(value: Dict): value is Dict & { tagName: string } {
  return value.nodeType === 1 && typeof value.tagName === 'string';
}

function isNode(value: Dict): value is Dict & { nodeName: string } {
  return typeof value.nodeType === 'number' && typeof value.nodeName === 'string';
}

export function isSessionToken(value: unknown): boolean {
  if (!isObject(value)) return false;
  const installed = (globalThis as { google?: { maps?: { places?: Dict } } }).google?.maps?.places
    ?.AutocompleteSessionToken;
  if (typeof installed === 'function' && value instanceof installed) return true;
  const ctor = (value as { constructor?: unknown }).constructor;
  return typeof ctor === 'function' && ctor.name === 'AutocompleteSessionToken';
}

export function isAutocomplete(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.getPlace === 'function' &&
    typeof value.addListener === 'function'
  );
}

function isLatLng(value: Dict): value is Dict & { lat(): unknown; lng(): unknown } {
  return typeof value.lat === 'function' && typeof value.lng === 'function';
}

function classPrototype(value: object): object | null {
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto === null || Object.getPrototypeOf(proto) === null) return null;
  return proto;
}

function prototypeGetters(proto: object): string[] {
  const names: string[] = [];
  for (let at: object | null = proto; at && Object.getPrototypeOf(at); ) {
    for (const name of Object.getOwnPropertyNames(at)) {
      if (!names.includes(name) && Object.getOwnPropertyDescriptor(at, name)?.get) names.push(name);
    }
    at = Object.getPrototypeOf(at) as object | null;
  }
  return names;
}

function className(proto: object): string {
  const name = (proto as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === 'string' && name !== '' ? name : '[anonymous]';
}

function readGetter(object: Dict, key: string): unknown {
  try {
    return object[key];
  } catch {
    return '[throws]';
  }
}

function normaliseNumber(value: number): number | string {
  if (Number.isNaN(value)) return '[NaN]';
  if (value === Number.POSITIVE_INFINITY) return '[Infinity]';
  if (value === Number.NEGATIVE_INFINITY) return '[-Infinity]';
  return Object.is(value, -0) ? 0 : value;
}

function walk(value: unknown, ancestors: object[]): unknown {
  if (value === undefined) return UNDEFINED;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return normaliseNumber(value);
  if (typeof value === 'function') return '[fn]';
  if (typeof value === 'bigint') return `[bigint ${value.toString()}]`;
  if (typeof value === 'symbol') return `[symbol ${value.description ?? ''}]`;
  const object = value as Dict;
  if (isElement(object)) return `[element ${object.tagName.toLowerCase()}]`;
  if (isNode(object)) return `[node ${object.nodeName.toLowerCase()}]`;
  if (isSessionToken(object)) return '[token]';
  if (isAutocomplete(object)) return '[autocomplete]';
  if (ancestors.includes(object)) return '[circular]';
  const next = [...ancestors, object];
  if (isLatLng(object)) return { lat: walk(object.lat(), next), lng: walk(object.lng(), next) };
  if (typeof object.toJSON === 'function') return walk((object.toJSON as () => unknown)(), next);
  if (Array.isArray(object)) {
    const out: unknown[] = [];
    for (let index = 0; index < object.length; index++) out.push(walk(object[index], next));
    return out;
  }
  if (object instanceof Map) {
    return { '[Map]': [...object].map(([key, item]) => [walk(key, next), walk(item, next)]) };
  }
  if (object instanceof Set) return { '[Set]': [...object].map((item) => walk(item, next)) };
  const out: Dict = {};
  if (object instanceof Error) {
    out.name = object.name;
    out.message = object.message;
  }
  const proto = object instanceof Error ? null : classPrototype(object);
  if (proto) out['[class]'] = className(proto);
  for (const key of Object.keys(object)) out[key] = walk(object[key], next);
  if (proto) {
    for (const key of prototypeGetters(proto)) {
      if (!(key in out)) out[key] = walk(readGetter(object, key), next);
    }
  }
  return out;
}

export function normalize(value: unknown): unknown {
  return walk(value, []);
}

export function normalizeConsoleArgs(args: readonly unknown[]): unknown[] {
  if (args.length === 0) return [];
  const [first, ...rest] = args;
  const head = first instanceof Error ? `${first.name}: ${first.message}` : String(first);
  return [head, ...rest.map((arg) => normalize(arg))];
}

export function collapseRepeats<T>(values: readonly T[]): T[] {
  const out: T[] = [];
  for (const value of values)
    if (out.length === 0 || out[out.length - 1] !== value) out.push(value);
  return out;
}
