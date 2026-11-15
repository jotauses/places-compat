import { applyFixture, createFakeGoogle, loadFixture } from '@places-compat/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { geocodeByAddress, geocodeByPlaceId, getLatLng } from '../src/geocode';

const SF_PLACE_ID = 'ChIJIQBpAG2ahYAR_6128GcTUEo';

let fake: ReturnType<typeof createFakeGoogle>;
let uninstall: () => void;

beforeEach(() => {
  fake = createFakeGoogle();
  uninstall = fake.install();
  applyFixture(fake.control, loadFixture('sf-geocode'));
});

afterEach(() => {
  uninstall();
});

function geocodeRequests(): unknown[] {
  return fake.control.calls.filter((call) => call.kind === 'geocode').map((call) => call.request);
}

describe('geocodeByAddress', () => {
  it('resolves with the geocoder results', async () => {
    const results = await geocodeByAddress('San Francisco');
    expect(results).toHaveLength(1);
    expect(results[0]?.place_id).toBe(SF_PLACE_ID);
    expect(results[0]?.formatted_address).toBe('San Francisco, CA, USA');
    expect(results[0]?.geometry.location.lat()).toBe(37.7749295);
    expect(geocodeRequests()).toEqual([{ address: 'San Francisco' }]);
  });

  it('rejects with the status string when the status is not OK', async () => {
    fake.control.onGeocode('Atlantis', { status: 'OVER_QUERY_LIMIT' });
    await expect(geocodeByAddress('Atlantis')).rejects.toBe('OVER_QUERY_LIMIT');
  });

  it('rejects with ZERO_RESULTS when nothing matches', async () => {
    await expect(geocodeByAddress('someinvalidaddress')).rejects.toBe('ZERO_RESULTS');
  });

  it('throws synchronously when the Maps API is not loaded', () => {
    uninstall();
    expect(() => geocodeByAddress('San Francisco')).toThrow(TypeError);
  });
});

describe('geocodeByPlaceId', () => {
  it('resolves with the geocoder results', async () => {
    const results = await geocodeByPlaceId(SF_PLACE_ID);
    expect(results.map((result) => result.formatted_address)).toEqual(['San Francisco, CA, USA']);
    expect(geocodeRequests()).toEqual([{ placeId: SF_PLACE_ID }]);
  });

  it('rejects with the status string when the status is not OK', async () => {
    fake.control.onGeocode('unknown-place', { status: 'INVALID_REQUEST' });
    await expect(geocodeByPlaceId('unknown-place')).rejects.toBe('INVALID_REQUEST');
  });
});

describe('getLatLng', () => {
  it('resolves with the location of a geocoder result', async () => {
    const [result] = await geocodeByAddress('San Francisco');
    if (!result) throw new Error('expected a geocoder result');
    await expect(getLatLng(result)).resolves.toEqual({ lat: 37.7749295, lng: -122.41941550000001 });
  });

  it('rejects with the error thrown while reading the location', async () => {
    const error = new Error('location unavailable');
    const result = {
      geometry: {
        location: {
          lat: () => {
            throw error;
          },
          lng: () => 0,
        },
      },
    } as unknown as google.maps.GeocoderResult;
    await expect(getLatLng(result)).rejects.toBe(error);
  });

  it('rejects with a TypeError when the result has no geometry', async () => {
    const result = {} as google.maps.GeocoderResult;
    await expect(getLatLng(result)).rejects.toBeInstanceOf(TypeError);
  });
});
