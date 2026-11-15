import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as ours from '../src/index';
import ReactGoogleAutocomplete, { usePlacesWidget } from '../src/index';
import usePlacesAutocompleteService, * as oursService from '../src/usePlacesAutocompleteService';
import usePlacesService, * as oursPlacesService from '../src/usePlacesService';
import usePlacesWidgetDefault, * as oursWidget from '../src/usePlacesWidget';

const requireUpstream = createRequire(import.meta.url);

// Upstream is CommonJS with exports.default, so its keys line up with an ES namespace.
function exportNames(mod: object): string[] {
  return Object.keys(mod)
    .filter((name) => name !== '__esModule')
    .sort();
}

describe('exports', () => {
  it.each([
    ['upstream-rga', ours, ['default', 'usePlacesWidget']],
    ['upstream-rga/lib/index', ours, ['default', 'usePlacesWidget']],
    ['upstream-rga/lib/usePlacesAutocompleteService', oursService, ['default']],
    ['upstream-rga/lib/usePlacesWidget', oursWidget, ['default']],
    // Upstream ships this one only as a minified module; ours re-exports usePlacesAutocompleteService.
    ['upstream-rga/lib/usePlacesService', oursPlacesService, ['default']],
  ])('%s has the same export names', (id, mod, expected) => {
    const upstream = requireUpstream(id) as Record<string, unknown>;
    expect(exportNames(mod)).toEqual(exportNames(upstream));
    expect(typeof mod.default).toBe(typeof upstream.default);
    expect(exportNames(mod)).toEqual(expected);
  });

  it('the mirrored types name their origin and license on the first line', () => {
    const { readFileSync } = requireUpstream('node:fs') as {
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const { resolve } = requireUpstream as unknown as { resolve(id: string): string };
    const first = readFileSync(resolve('../src/types.ts'), 'utf8').split('\n')[0];
    expect(first).toMatch(/^\/\/ .*react-google-autocomplete 2\.7\.5.*MIT License/);
  });

  it('usePlacesService is usePlacesAutocompleteService', () => {
    expect(usePlacesService).toBe(usePlacesAutocompleteService);
  });

  it('usePlacesWidget is the same function in the index and its own module', () => {
    expect(usePlacesWidget).toBe(usePlacesWidgetDefault);
  });

  it('the default export is a forwardRef component like upstream', () => {
    const upstream = requireUpstream('upstream-rga') as { default: { $$typeof?: unknown } };
    const ours = ReactGoogleAutocomplete as unknown as { $$typeof?: unknown; render?: unknown };
    expect(ours.$$typeof).toBe(Symbol.for('react.forward_ref'));
    expect(ours.$$typeof).toBe(upstream.default.$$typeof);
    expect(typeof ours.render).toBe('function');
  });
});
