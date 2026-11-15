import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import PlacesAutocomplete, * as ours from '../src/index';

const requireUpstream = createRequire(import.meta.url);

// Upstream is CommonJS with exports.default, so its keys line up with an ES namespace.
function exportNames(mod: object): string[] {
  return Object.keys(mod)
    .filter((name) => name !== '__esModule')
    .sort();
}

describe('exports', () => {
  it('match the export names of react-places-autocomplete', () => {
    const upstream = requireUpstream('upstream-rpa') as Record<string, unknown>;
    expect(exportNames(ours)).toEqual(exportNames(upstream));
    expect(exportNames(ours)).toEqual([
      'default',
      'geocodeByAddress',
      'geocodeByPlaceId',
      'getLatLng',
    ]);
    for (const name of exportNames(upstream)) {
      expect(typeof (ours as Record<string, unknown>)[name]).toBe(typeof upstream[name]);
    }
  });

  it('default export is a class component with propTypes and defaultProps', () => {
    const component = PlacesAutocomplete as unknown as {
      prototype: { isReactComponent?: unknown };
      propTypes?: Record<string, unknown>;
      defaultProps?: Record<string, unknown>;
    };
    expect(typeof PlacesAutocomplete).toBe('function');
    expect(component.prototype.isReactComponent).toBeDefined();
    expect(component.propTypes).toEqual(expect.any(Object));
    expect(component.defaultProps).toEqual(expect.any(Object));
  });

  it('propTypes and defaultProps cover the same keys as react-places-autocomplete', () => {
    const upstream = requireUpstream('upstream-rpa') as {
      default: { propTypes: object; defaultProps: object };
    };
    const component = PlacesAutocomplete as unknown as { propTypes: object; defaultProps: object };
    expect(Object.keys(component.propTypes).sort()).toEqual(
      Object.keys(upstream.default.propTypes).sort(),
    );
    expect(Object.keys(component.defaultProps).sort()).toEqual(
      Object.keys(upstream.default.defaultProps).sort(),
    );
  });
});
