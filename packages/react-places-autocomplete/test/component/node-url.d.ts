// Minimal typing for fileURLToPath so the tests do not need the full Node types.
declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}
