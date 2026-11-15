// @vitest-environment node
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import usePlacesAutocomplete, { getLatLng, getZipCode } from '../src';

type Mod = typeof import('../src');

const EXPORTS = ['default', 'getDetails', 'getGeocode', 'getLatLng', 'getZipCode'] as const;

const globals = globalThis as unknown as Record<string, unknown>;

function trap(name: string, touched: string[]): () => void {
  const previous = Object.getOwnPropertyDescriptor(globals, name);
  Object.defineProperty(globals, name, {
    configurable: true,
    get() {
      touched.push(name);
      return undefined;
    },
  });
  return () => {
    if (previous) Object.defineProperty(globals, name, previous);
    else delete globals[name];
  };
}

async function importFresh(): Promise<Mod> {
  vi.resetModules();
  return (await import('../src')) as Mod;
}

const geocodeResult = {
  address_components: [
    { long_name: '75001 Paris', short_name: '75001', types: ['postal_code'] },
    { long_name: 'Paris', short_name: 'Paris', types: ['locality', 'political'] },
  ],
  formatted_address: '75001 Paris, France',
  geometry: { location: { lat: () => 48.8566, lng: () => 2.3522 } },
  place_id: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
  types: ['postal_code'],
} as unknown as google.maps.GeocoderResult;

function Field(): React.ReactElement {
  const { ready, value } = usePlacesAutocomplete({ defaultValue: 'Paris' });
  return React.createElement('input', { value, readOnly: true, disabled: !ready });
}

describe('in a node environment', () => {
  const restores: (() => void)[] = [];

  afterEach(() => {
    for (const restore of restores.splice(0).reverse()) restore();
  });

  it('runs without window', () => {
    expect(typeof window).toBe('undefined');
  });

  it('imports without reading window, google or sessionStorage', async () => {
    const touched: string[] = [];
    for (const name of ['window', 'google', 'sessionStorage']) restores.push(trap(name, touched));

    const mod = await importFresh();

    expect(touched).toEqual([]);
    expect(Object.keys(mod).sort()).toEqual([...EXPORTS]);
    for (const name of EXPORTS) expect(typeof mod[name]).toBe('function');
  });

  it('runs getLatLng and getZipCode without window', () => {
    expect(getLatLng(geocodeResult)).toEqual({ lat: 48.8566, lng: 2.3522 });
    expect(getZipCode(geocodeResult, true)).toBe('75001');
    expect(getZipCode(geocodeResult, false)).toBe('75001 Paris');
    expect(getZipCode({ ...geocodeResult, address_components: [] }, false)).toBeUndefined();
  });

  it('renders the hook to a string without window', () => {
    const html = renderToString(React.createElement(Field));

    expect(html).toContain('value="Paris"');
    expect(html).toContain('disabled=""');
  });
});
