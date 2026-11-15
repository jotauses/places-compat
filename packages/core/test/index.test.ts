import { describe, expect, it } from 'vitest';
import * as core from '../src';
import * as testing from '../src/testing';

const CORE_FUNCTIONS = [
  'createAutocompleteServiceShim',
  'createPlacesServiceShim',
  'createSession',
  'debounce',
  'fetchDetails',
  'fetchPredictions',
  'getPlaces',
  'loadPlaces',
  'sharedSession',
  'synthesizeTerms',
  'toAutocompleteRequest',
  'toLegacyPlaceResult',
  'toLegacyPrediction',
  'toLegacyStatus',
  'toPlaceFields',
];

const TESTING_FUNCTIONS = [
  'actCompat',
  'applyFixture',
  'compareTraces',
  'createFakeGoogle',
  'createLegacyFakeGoogle',
  'fakeMapsError',
  'hookSubject',
  'loadFixture',
  'renderCompat',
  'renderHookCompat',
  'rpaSubject',
  'runScenario',
  'serviceHookSubject',
  'widgetSubject',
];

describe('@places-compat/core exports', () => {
  it('exports exactly the names of the core entry', () => {
    const expected = [
      ...CORE_FUNCTIONS,
      'MIN_MAPS_VERSION',
      'NEW_API_HINT',
      'PlacesUnavailableError',
    ];
    expect(Object.keys(core).sort()).toEqual(expected.sort());
  });

  it.each(CORE_FUNCTIONS)('%s is a function', (name) => {
    expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
  });

  it('MIN_MAPS_VERSION and NEW_API_HINT are strings', () => {
    expect(typeof core.MIN_MAPS_VERSION).toBe('string');
    expect(typeof core.NEW_API_HINT).toBe('string');
  });

  it('PlacesUnavailableError is an Error class', () => {
    expect(typeof core.PlacesUnavailableError).toBe('function');
    expect(new core.PlacesUnavailableError('no-places')).toBeInstanceOf(Error);
  });
});

describe('@places-compat/core/testing exports', () => {
  it('exports exactly the names of the testing entry', () => {
    expect(Object.keys(testing).sort()).toEqual([...TESTING_FUNCTIONS].sort());
  });

  it.each(TESTING_FUNCTIONS)('%s is a function', (name) => {
    expect(typeof (testing as Record<string, unknown>)[name]).toBe('function');
  });
});
