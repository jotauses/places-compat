import { fetchPredictions, loadPlaces, NEW_API_HINT, sharedSession } from '@places-compat/core';
import {
  applyFixture,
  createFakeGoogle,
  createLegacyFakeGoogle,
  type FakeControl,
  fakeMapsError,
  loadFixture,
} from '@places-compat/core/testing';
import * as upstream from 'upstream-upa';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { getDetails, getGeocode, getLatLng, getZipCode } from '../src/index';
import type { GeocodeResult } from '../src/types';

type Maps = typeof google.maps;
type PlaceOptions = google.maps.places.PlaceOptions;
type FakeOptions = NonNullable<Parameters<typeof createFakeGoogle>[0]>;

const LOAD_API_ERR =
  '💡 use-places-autocomplete: Google Maps Places API library must be loaded. See: https://github.com/wellyshen/use-places-autocomplete#load-the-library';
const GEOCODE_ERR =
  '💡 use-places-autocomplete: Please provide an address when using getGeocode() with the componentRestrictions.';
const GET_DETAILS_ERR =
  '💡 use-places-autocomplete: Please provide a place Id when using getDetails() either as a string or as part of an Autocomplete Prediction.';
const NEW_API_ERR = `${LOAD_API_ERR}\n${NEW_API_HINT}`;

const ALL_FIELDS_EXCEPT_ID = [
  'addressComponents',
  'adrFormatAddress',
  'formattedAddress',
  'location',
  'viewport',
  'plusCode',
  'types',
  'photos',
  'displayName',
  'businessStatus',
  'utcOffsetMinutes',
  'iconBackgroundColor',
  'svgIconMaskURI',
  'regularOpeningHours',
  'priceLevel',
  'rating',
  'userRatingCount',
  'websiteURI',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'reviews',
  'googleMapsURI',
  'shortFormattedAddress',
  'attributions',
];

const globalRef = globalThis as { google?: unknown };

let errorSpy: MockInstance<typeof console.error>;
let restores: (() => void)[] = [];
let hadGoogle = false;
let savedGoogle: unknown;

beforeEach(() => {
  hadGoogle = Object.getOwnPropertyDescriptor(globalRef, 'google') !== undefined;
  savedGoogle = globalRef.google;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const restore of restores.reverse()) restore();
  restores = [];
  if (hadGoogle) globalRef.google = savedGoogle;
  else delete globalRef.google;
  vi.restoreAllMocks();
});

function install(opts?: FakeOptions) {
  const fake = createFakeGoogle(opts);
  restores.push(fake.install());
  return fake;
}

function setGoogle(value: unknown): void {
  globalRef.google = value;
}

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function callsOf(control: FakeControl, kind: FakeControl['calls'][number]['kind']) {
  return control.calls.filter((call) => call.kind === kind);
}

function recordPlaceOptions(maps: Maps): PlaceOptions[] {
  const seen: PlaceOptions[] = [];
  const patched = new WeakSet<object>();
  const patch = (lib: google.maps.PlacesLibrary) => {
    if (patched.has(lib)) return lib;
    patched.add(lib);
    const Original = lib.Place;
    (lib as { Place: unknown }).Place = class extends Original {
      constructor(options: PlaceOptions) {
        seen.push({ ...options });
        super(options);
      }
    };
    return lib;
  };
  if (maps.places) patch(maps.places as unknown as google.maps.PlacesLibrary);
  const importLibrary = maps.importLibrary;
  (maps as { importLibrary: unknown }).importLibrary = (name: string) =>
    importLibrary(name).then((lib) =>
      name === 'places' ? patch(lib as google.maps.PlacesLibrary) : lib,
    );
  return seen;
}

function geocodeResult(components: google.maps.GeocoderAddressComponent[]): GeocodeResult {
  return { address_components: components } as unknown as GeocodeResult;
}

describe('getGeocode', () => {
  it('constructs window.google.maps.Geocoder and passes the request through', () => {
    const geocode = vi.fn();
    const constructed = vi.fn();
    setGoogle({
      maps: {
        Geocoder: class {
          geocode = geocode;
          constructor() {
            constructed();
          }
        },
      },
    });
    const args = { address: 'Taipei', placeId: '0109' };

    void getGeocode(args);

    expect(constructed).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith(args, expect.any(Function));
  });

  it('reads window.google when called, not when imported', async () => {
    expect(globalRef.google).toBeUndefined();
    const { control } = install();
    const promise = getGeocode({ address: 'Taipei' });
    expect(callsOf(control, 'geocode')).toEqual([
      { seq: 1, kind: 'geocode', request: { address: 'Taipei' } },
    ]);
    await expect(promise).rejects.toBe('ZERO_RESULTS');
  });

  it('resolves the results when the status is OK', async () => {
    const { control } = install();
    applyFixture(control, loadFixture('sf-geocode'));

    const results = await getGeocode({ address: 'San Francisco' });

    expect(plain(results)).toEqual(loadFixture('sf-geocode').geocode);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('resolves the exact array the geocoder hands to the callback', async () => {
    const data = [{ place_id: '0109' }];
    setGoogle({
      maps: {
        Geocoder: class {
          geocode(_: unknown, cb: (results: unknown, status: string) => void) {
            cb(data, 'OK');
          }
        },
      },
    });
    await expect(getGeocode({ address: 'Taipei' })).resolves.toBe(data);
  });

  it.each([
    ['ZERO_RESULTS', undefined],
    ['REQUEST_DENIED', { status: 'REQUEST_DENIED' }],
    ['OVER_QUERY_LIMIT', { status: 'OVER_QUERY_LIMIT' }],
    ['INVALID_REQUEST', { status: 'INVALID_REQUEST' }],
  ])('rejects with the status string %s', async (status, reply) => {
    const { control } = install();
    if (reply) control.onGeocode('Taipei', reply);

    await expect(getGeocode({ address: 'Taipei' })).rejects.toBe(status);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects with whatever status the geocoder reports', async () => {
    setGoogle({
      maps: {
        Geocoder: class {
          geocode(_: unknown, cb: (results: unknown, status: string) => void) {
            cb(null, 'ERROR');
          }
        },
      },
    });
    await expect(getGeocode({ address: 'Taipei' })).rejects.toBe('ERROR');
  });

  it('logs the address hint and still resolves when only componentRestrictions is given', async () => {
    const { control } = install();
    const sf = loadFixture('sf-geocode').geocode as GeocodeResult[];
    control.onGeocode((req) => req.componentRestrictions?.postalCode === '94103', sf);

    const results = await getGeocode({
      componentRestrictions: { country: 'US', postalCode: '94103' },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GEOCODE_ERR);
    expect(plain(results)).toEqual(sf);
  });

  it('logs the address hint before rejecting when the status is not OK', async () => {
    install();

    await expect(getGeocode({ componentRestrictions: { country: 'TW' } })).rejects.toBe(
      'ZERO_RESULTS',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GEOCODE_ERR);
  });

  it('does not log when an address comes with componentRestrictions', async () => {
    const { control } = install();
    const sf = loadFixture('sf-geocode').geocode as GeocodeResult[];
    control.onGeocode('San Francisco', sf);

    await getGeocode({ address: 'San Francisco', componentRestrictions: { country: 'US' } });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log when neither address nor componentRestrictions is given', async () => {
    const { control } = install();
    const sf = loadFixture('sf-geocode').geocode as GeocodeResult[];
    control.onGeocode('ChIJIQBpAG2ahYAR_6128GcTUEo', sf);

    await getGeocode({ placeId: 'ChIJIQBpAG2ahYAR_6128GcTUEo' });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('throws a TypeError synchronously without window.google', () => {
    expect(() => getGeocode({ address: 'Taipei' })).toThrow(TypeError);
  });
});

describe('getLatLng', () => {
  it('returns plain numbers from a geocoder result', async () => {
    const { control } = install();
    applyFixture(control, loadFixture('sf-geocode'));
    const [result] = await getGeocode({ address: 'San Francisco' });

    const latLng = getLatLng(result as GeocodeResult);

    expect(latLng).toEqual({ lat: 37.7749295, lng: -122.41941550000001 });
    expect(Object.getPrototypeOf(latLng)).toBe(Object.prototype);
    expect(Object.keys(latLng)).toEqual(['lat', 'lng']);
    expect(typeof latLng.lat).toBe('number');
    expect(typeof latLng.lng).toBe('number');
  });

  it('calls lat() and lng() as methods of the location, where the original throws', async () => {
    const { control } = install();
    applyFixture(control, loadFixture('sf-geocode'));
    const [result] = (await getGeocode({ address: 'San Francisco' })) as GeocodeResult[];
    const location = result?.geometry.location as google.maps.LatLng;
    const { lat: detachedLat } = location;

    expect(() => detachedLat()).toThrow(TypeError);
    expect(getLatLng(result as GeocodeResult)).toEqual({
      lat: 37.7749295,
      lng: -122.41941550000001,
    });
    expect(() => upstream.getLatLng(result as GeocodeResult)).toThrow(TypeError);
  });

  it('calls lat() and lng() on the location', () => {
    const lat = vi.fn(() => 25.03);
    const lng = vi.fn(() => 121.56);
    const result = { geometry: { location: { lat, lng } } } as unknown as GeocodeResult;

    expect(getLatLng(result)).toEqual({ lat: 25.03, lng: 121.56 });
    expect(lat).toHaveBeenCalledTimes(1);
    expect(lng).toHaveBeenCalledTimes(1);
  });
});

describe('getZipCode', () => {
  const result = geocodeResult([
    { long_name: '1600', short_name: '1600', types: ['street_number'] },
    { long_name: '94043-1351', short_name: '94043', types: ['postal_code'] },
    { long_name: '10001-0001', short_name: '10001', types: ['postal_code'] },
  ]);

  it('returns the short name when useShortName is true', () => {
    expect(getZipCode(result, true)).toBe('94043');
  });

  it('returns the long name when useShortName is false', () => {
    expect(getZipCode(result, false)).toBe('94043-1351');
  });

  it('uses the first component whose types include postal_code', () => {
    const mixed = geocodeResult([
      { long_name: '94043', short_name: '94043', types: ['postal_code_suffix'] },
      { long_name: '10001', short_name: '10001', types: ['political', 'postal_code'] },
      { long_name: '20002', short_name: '20002', types: ['postal_code'] },
    ]);
    expect(getZipCode(mixed, false)).toBe('10001');
  });

  it('returns undefined when no component is a postal code', async () => {
    const { control } = install();
    applyFixture(control, loadFixture('sf-geocode'));
    const [sf] = await getGeocode({ address: 'San Francisco' });

    expect(getZipCode(sf as GeocodeResult, true)).toBeUndefined();
    expect(getZipCode(sf as GeocodeResult, false)).toBeUndefined();
    expect(getZipCode(geocodeResult([]), true)).toBeUndefined();
  });
});

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe.each<[string, () => void]>([
  [
    'window.google is missing',
    () => {
      delete globalRef.google;
    },
  ],
  ['window.google is empty', () => setGoogle({})],
  ['window.google.maps is undefined', () => setGoogle({ maps: undefined })],
])('getDetails: when %s', (_label, arrange) => {
  beforeEach(arrange);

  it.each<[string, google.maps.places.PlaceDetailsRequest]>([
    ['with a placeId', { placeId: 'synthetic-details-full' }],
    ['without a placeId', {} as google.maps.places.PlaceDetailsRequest],
  ])('throws the same TypeError as the original synchronously %s', (_case, args) => {
    let returned: unknown = 'not called';
    const ours = thrownBy(() => {
      returned = getDetails(args);
    });
    const original = thrownBy(() => upstream.getDetails(args));

    expect(ours).toBeInstanceOf(TypeError);
    expect(original).toBeInstanceOf(TypeError);
    expect((ours as TypeError).message).toBe((original as TypeError).message);
    expect(returned).toBe('not called');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('getDetails: UPA-06, google.maps without the places library or importLibrary', () => {
  beforeEach(() => setGoogle({ maps: {} }));

  it('rejects with the place Id hint without a placeId, where the original throws', async () => {
    expect(() => upstream.getDetails({} as google.maps.places.PlaceDetailsRequest)).toThrow(
      TypeError,
    );

    await expect(getDetails({} as google.maps.places.PlaceDetailsRequest)).rejects.toBe(
      GET_DETAILS_ERR,
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GET_DETAILS_ERR);
  });

  it('logs the new API hint and rejects with UNKNOWN_ERROR with a placeId, where the original throws', async () => {
    expect(() => upstream.getDetails({ placeId: 'synthetic-details-full' })).toThrow(TypeError);

    await expect(getDetails({ placeId: 'synthetic-details-full' })).rejects.toBe('UNKNOWN_ERROR');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(NEW_API_ERR);
  });
});

describe('getDetails: without a placeId', () => {
  it.each([
    ['missing', {}],
    ['empty', { placeId: '' }],
  ])('logs and rejects with the place Id hint when the placeId is %s', async (_label, args) => {
    const { control } = install({ places: 'viaImportLibrary' });

    const promise = getDetails(args as google.maps.places.PlaceDetailsRequest);

    await expect(promise).rejects.toBe(GET_DETAILS_ERR);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GET_DETAILS_ERR);
    expect(control.calls).toEqual([]);
  });

  it('logs and rejects like the original on the legacy library', async () => {
    restores.push(createLegacyFakeGoogle().install());
    const args = {} as google.maps.places.PlaceDetailsRequest;

    await expect(upstream.getDetails(args)).rejects.toBe(GET_DETAILS_ERR);
    await expect(getDetails(args)).rejects.toBe(GET_DETAILS_ERR);
    expect(errorSpy.mock.calls).toEqual([[GET_DETAILS_ERR], [GET_DETAILS_ERR]]);
  });

  it('does not need the places library', async () => {
    install({ places: 'absent', importLibrary: false });

    await expect(getDetails({} as google.maps.places.PlaceDetailsRequest)).rejects.toBe(
      GET_DETAILS_ERR,
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GET_DETAILS_ERR);
  });
});

describe('getDetails: when the places library cannot be obtained', () => {
  it.each<[string, FakeOptions]>([
    [
      'only the legacy library is loaded and importLibrary is missing',
      {
        places: 'legacyOnly',
        importLibrary: false,
      },
    ],
    [
      'no places library is loaded and importLibrary is missing',
      {
        places: 'absent',
        importLibrary: false,
      },
    ],
    ['importLibrary rejects', { places: 'absent' }],
    ['importLibrary returns the legacy library', { places: 'legacyOnly' }],
  ])('logs the new API hint and rejects with UNKNOWN_ERROR when %s', async (_label, opts) => {
    const { control } = install(opts);

    await expect(getDetails({ placeId: 'synthetic-details-full' })).rejects.toBe('UNKNOWN_ERROR');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(NEW_API_ERR);
    expect(callsOf(control, 'fetchFields')).toEqual([]);
  });

  it('logs the load hint followed by the new API hint on its own line', async () => {
    install({ places: 'legacyOnly', importLibrary: false });

    await getDetails({ placeId: 'synthetic-details-full' }).catch(() => {});

    const [[message]] = errorSpy.mock.calls as [[string]];
    expect(message.split('\n')).toEqual([LOAD_API_ERR, NEW_API_HINT]);
  });
});

describe.each(['present', 'viaImportLibrary'] as const)('getDetails: places %s', (mode) => {
  it.each(['details-full', 'sf-geocode'])('resolves the legacy PlaceResult of %s', async (slug) => {
    const { control } = install({ places: mode });
    const fixture = loadFixture(slug);
    applyFixture(control, fixture);
    const placeId = fixture.detailsNew?.id as string;

    const result = await getDetails({ placeId });

    expect(plain(result)).toEqual(fixture.detailsLegacy);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps LatLng and function members on the result', async () => {
    const { control } = install({ places: mode });
    applyFixture(control, loadFixture('details-full'));

    const result = (await getDetails({
      placeId: 'synthetic-details-full',
    })) as google.maps.places.PlaceResult;

    expect(result.geometry?.location?.lat()).toBe(40.4168);
    expect(typeof result.photos?.[0]?.getUrl).toBe('function');
    expect(result.opening_hours?.isOpen()).toBeUndefined();
  });

  it('requests the full mapped field list when fields is omitted', async () => {
    const { control } = install({ places: mode });
    applyFixture(control, loadFixture('details-full'));

    await getDetails({ placeId: 'synthetic-details-full' });

    expect(callsOf(control, 'fetchFields').map((call) => call.request)).toEqual([
      { placeId: 'synthetic-details-full', fields: ALL_FIELDS_EXCEPT_ID },
    ]);
  });

  it('requests and returns only the fields asked for', async () => {
    const { control } = install({ places: mode });
    const fixture = loadFixture('details-full');
    applyFixture(control, fixture);
    const legacy = fixture.detailsLegacy as google.maps.places.PlaceResult;

    const result = await getDetails({
      placeId: 'synthetic-details-full',
      fields: ['name', 'formatted_address', 'geometry'],
    });

    expect(callsOf(control, 'fetchFields').map((call) => call.request)).toEqual([
      {
        placeId: 'synthetic-details-full',
        fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
      },
    ]);
    expect(plain(result)).toEqual({
      name: legacy.name,
      formatted_address: legacy.formatted_address,
      geometry: legacy.geometry,
    });
  });

  it('forwards language and region to the Place', async () => {
    const fake = install({ places: mode });
    const seen = recordPlaceOptions(fake.google.maps);
    fake.control.onFetchFields('synthetic-details-full', {
      id: 'synthetic-details-full',
      displayName: 'Café Exemple',
    });

    const result = await getDetails({
      placeId: 'synthetic-details-full',
      fields: ['name'],
      language: 'fr',
      region: 'ca',
    });

    expect(seen).toEqual([
      { id: 'synthetic-details-full', requestedLanguage: 'fr', requestedRegion: 'ca' },
    ]);
    expect(plain(result)).toEqual({ name: 'Café Exemple' });
  });

  it('builds a new Place without language or region when none is given', async () => {
    const fake = install({ places: mode });
    const seen = recordPlaceOptions(fake.google.maps);
    applyFixture(fake.control, loadFixture('details-full'));

    await getDetails({ placeId: 'synthetic-details-full', fields: ['name'] });

    expect(seen).toEqual([{ id: 'synthetic-details-full' }]);
    expect(callsOf(fake.control, 'toPlace')).toEqual([]);
  });

  it('rejects with NOT_FOUND when the place is unknown', async () => {
    install({ places: mode });

    await expect(getDetails({ placeId: 'unknown-place' })).rejects.toBe('NOT_FOUND');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_REQUEST', fakeMapsError('INVALID_ARGUMENT', 'PLACES_GET_PLACE')],
    ['REQUEST_DENIED', fakeMapsError('PERMISSION_DENIED')],
    ['OVER_QUERY_LIMIT', fakeMapsError('RESOURCE_EXHAUSTED', 'PLACES_GET_PLACE')],
    ['UNKNOWN_ERROR', fakeMapsError('INTERNAL', 'PLACES_GET_PLACE')],
  ])('rejects with %s when fetching fields fails', async (status, error) => {
    const { control } = install({ places: mode });
    control.onFetchFields('synthetic-details-full', error);

    await expect(getDetails({ placeId: 'synthetic-details-full' })).rejects.toBe(status);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses the prediction from an earlier search for the same place', async () => {
    const fake = install({ places: mode });
    const fixture = loadFixture('details-full');
    applyFixture(fake.control, fixture);
    const places = await loadPlaces(fake.google.maps);
    const search = await fetchPredictions(places, fixture.request, {
      session: sharedSession(places),
    });
    expect(search.status).toBe('OK');
    const seen = recordPlaceOptions(fake.google.maps);

    const result = await getDetails({ placeId: 'synthetic-details-full' });

    expect(callsOf(fake.control, 'toPlace').map((call) => call.request)).toEqual([
      { placeId: 'synthetic-details-full' },
    ]);
    expect(seen).toEqual([]);
    expect(plain(result)).toEqual(fixture.detailsLegacy);
  });

  it('does not use an earlier prediction for a different place', async () => {
    const fake = install({ places: mode });
    const fixture = loadFixture('details-full');
    applyFixture(fake.control, fixture);
    const places = await loadPlaces(fake.google.maps);
    await fetchPredictions(places, fixture.request, { session: sharedSession(places) });
    fake.control.onFetchFields('other-place', { id: 'other-place', displayName: 'Other' });

    const result = await getDetails({ placeId: 'other-place', fields: ['name'] });

    expect(callsOf(fake.control, 'toPlace')).toEqual([]);
    expect(plain(result)).toEqual({ name: 'Other' });
  });
});
