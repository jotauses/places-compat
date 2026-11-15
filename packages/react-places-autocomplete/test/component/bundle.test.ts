// @vitest-environment node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';
import { describe, expect, it } from 'vitest';
import PlacesAutocomplete from '../../src/index';
import config from '../../tsdown.config';

const packageDir = fileURLToPath(new URL('../..', import.meta.url));
const requireFromPackage = createRequire(`${packageDir}package.json`);

async function bundle(): Promise<Map<string, string>> {
  const handle = await build({
    ...(config as object),
    config: false,
    cwd: packageDir,
    outDir: 'node_modules/.cache/bundle-test',
    clean: false,
    write: false,
    dts: false,
    sourcemap: false,
    logLevel: 'silent',
  });
  const files = new Map<string, string>();
  for (const { chunks } of handle.bundles) {
    for (const chunk of chunks) {
      if (chunk.type === 'chunk') files.set(chunk.fileName, chunk.code);
    }
  }
  return files;
}

function evaluateCjs(code: string): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', code)(module, module.exports, requireFromPackage);
  return module.exports;
}

describe('component name', () => {
  it('is PlacesAutocomplete in the source entry', () => {
    expect(PlacesAutocomplete.name).toBe('PlacesAutocomplete');
  });

  it('is PlacesAutocomplete in the ESM and CJS bundles', async () => {
    const files = await bundle();
    const cjs = files.get('index.cjs');
    const esm = files.get('index.mjs');
    expect(cjs).toBeDefined();
    expect(esm).toBeDefined();

    expect((evaluateCjs(cjs as string).default as { name: string }).name).toBe(
      'PlacesAutocomplete',
    );
    expect(esm).toMatch(/\bvar PlacesAutocomplete = class extends\b/);
    expect(esm).not.toMatch(/\bPlacesAutocomplete\$\d/);
  }, 20_000);
});
