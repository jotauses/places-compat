import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as ours from '../src/index';

const requireUpstream = createRequire(import.meta.url);

function exportNames(mod: object): string[] {
  return Object.keys(mod)
    .filter((name) => name !== '__esModule')
    .sort();
}

describe('exports', () => {
  it('match the export names of use-places-autocomplete', () => {
    const upstream = requireUpstream('upstream-upa') as Record<string, unknown>;
    expect(exportNames(ours)).toEqual(exportNames(upstream));
    expect(typeof ours.default).toBe(typeof upstream.default);
    expect(exportNames(ours)).toEqual([
      'default',
      'getDetails',
      'getGeocode',
      'getLatLng',
      'getZipCode',
    ]);
  });
});
