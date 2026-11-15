import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2018',
  fixedExtension: true,
  dts: { tsc: { eager: true } },
  banner: { dts: '/// <reference types="google.maps" />' },
  sourcemap: true,
  outputOptions: { exports: 'named' },
  cjsDefault: false,
  deps: { alwaysBundle: ['@places-compat/core'] },
});
