// Ported from use-places-autocomplete 4.0.1, src/__tests__/getGeocode.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { geocodeErr } from '../../src/messages';
import type { GeoArgs } from '../../src/types';
import { getGeocode } from '../../src/utils';

type Scope = { google?: unknown };

const scope = globalThis as Scope;
const hadGoogle = Object.getOwnPropertyDescriptor(scope, 'google') !== undefined;
const originalGoogle = scope.google;

const data = [{ place_id: '0109' }];
const error = 'ERROR';
const geocode = vi.fn();
const setupMaps = (type = 'success') => {
  scope.google = {
    maps: {
      Geocoder: class {
        geocode =
          type === 'opts'
            ? geocode
            : (_: unknown, cb: (dataArg: unknown, status: string) => void) => {
                cb(type === 'success' ? data : null, type === 'success' ? 'OK' : error);
              };
      },
    },
  };
};

describe('getGeocode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    geocode.mockReset();
    if (hadGoogle) scope.google = originalGoogle;
    else delete scope.google;
  });

  it('should set options correctly', () => {
    setupMaps('opts');
    const opts = { address: 'Taipei', placeId: '0109' };
    getGeocode(opts);
    expect(geocode).toHaveBeenCalledWith(opts, expect.any(Function));
  });

  it('should handle success correctly', () => {
    setupMaps();
    return getGeocode({ address: 'Taipei' }).then((results) => expect(results).toBe(data));
  });

  it('should handle failure correctly', async () => {
    setupMaps('failure');
    let err: unknown;
    try {
      await getGeocode({ address: 'Taipei' });
    } catch (someErr) {
      err = someErr;
    }
    expect(err).toBe(error);
  });

  it('should restrict the result to Taiwan and fail', async () => {
    setupMaps('failure');
    let err: unknown;
    try {
      await getGeocode({
        address: 'Belgrade',
        componentRestrictions: { country: 'TW' },
      });
    } catch (someErr) {
      err = someErr;
    }
    expect(err).toBe(error);
  });

  it('should restrict the result to Taiwan and pass', () => {
    setupMaps();
    return getGeocode({
      address: 'Taipei',
      componentRestrictions: { country: 'TW' },
    }).then((results) => expect(results).toBe(data));
  });

  it('should throw error when providing componentRestrictions without address', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    setupMaps();
    const args: GeoArgs = { componentRestrictions: { country: 'TW', postalCode: '100' } };
    return getGeocode(args).then((results) => {
      expect(consoleError).toHaveBeenCalledWith(geocodeErr);
      expect(results).toBe(data);
      return null;
    });
  });
});
