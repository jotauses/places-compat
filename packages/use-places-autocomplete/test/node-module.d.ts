declare module 'node:module' {
  export function createRequire(path: string): (id: string) => unknown;
}
