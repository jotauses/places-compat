// Minimal typing for createRequire so the tests do not need the full Node types.
declare module 'node:module' {
  export function createRequire(path: string): (id: string) => unknown;
}
