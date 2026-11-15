// Ported from react-places-autocomplete 7.3.0 src/tests/utils.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { applyFixture, createFakeGoogle, loadFixture } from '@places-compat/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { geocodeByAddress, geocodeByPlaceId } from '../../src';

const GEOCODE_RESULT = [
  {
    address_components: [
      {
        long_name: 'San Francisco',
        short_name: 'SF',
        types: ['locality', 'political'],
      },
      {
        long_name: 'San Francisco County',
        short_name: 'San Francisco County',
        types: ['administrative_area_level_2', 'political'],
      },
      {
        long_name: 'California',
        short_name: 'CA',
        types: ['administrative_area_level_1', 'political'],
      },
      {
        long_name: 'United States',
        short_name: 'US',
        types: ['country', 'political'],
      },
    ],
    formatted_address: 'San Francisco, CA, USA',
    geometry: {
      bounds: {
        south: 37.6398299,
        west: -123.17382499999997,
        north: 37.9298239,
        east: -122.28178000000003,
      },
      location: { lat: 37.7749295, lng: -122.41941550000001 },
      location_type: 'APPROXIMATE',
      viewport: {
        south: 37.70339999999999,
        west: -122.52699999999999,
        north: 37.812,
        east: -122.34820000000002,
      },
    },
    place_id: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
    types: ['locality', 'political'],
  },
];

function plain(results: google.maps.GeocoderResult[]): unknown {
  return JSON.parse(JSON.stringify(results));
}

let uninstall: () => void;

beforeEach(() => {
  const fake = createFakeGoogle();
  uninstall = fake.install();
  const fixture = loadFixture('sf-geocode');
  applyFixture(fake.control, fixture);
  fake.control.onGeocode(/^San Francisco/, fixture.geocode ?? []);
});

afterEach(() => {
  uninstall();
});

describe('geocodeByAddress', () => {
  it('geocodes valid address', () => {
    expect.assertions(2);
    return geocodeByAddress('San Francisco, CA').then((results) => {
      expect(plain(results)).toEqual(GEOCODE_RESULT);
      expect(results[0]?.geometry.location.lat()).toBe(37.7749295);
    });
  });

  it('rejects invalid address', () => {
    expect.assertions(2);
    return geocodeByAddress('someinvalidaddress').catch((error) => {
      expect(error).toBeDefined();
      expect(error).toBe('ZERO_RESULTS');
    });
  });
});

describe('geocodeByPlaceId', () => {
  it('geocode valid placeID', () => {
    expect.assertions(1);
    return geocodeByPlaceId('ChIJIQBpAG2ahYAR_6128GcTUEo').then((results) => {
      expect(plain(results)).toEqual(GEOCODE_RESULT);
    });
  });
});
