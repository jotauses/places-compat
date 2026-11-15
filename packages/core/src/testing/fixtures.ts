import amoebaDetailsLegacy from '../../fixtures/amoeba/details.legacy.json';
import amoebaDetailsNew from '../../fixtures/amoeba/details.new.json';
import amoebaLegacy from '../../fixtures/amoeba/legacy.json';
import amoebaMeta from '../../fixtures/amoeba/meta.json';
import amoebaNew from '../../fixtures/amoeba/new.json';
import amoebaRequest from '../../fixtures/amoeba/request.json';
import detailsFullDetailsLegacy from '../../fixtures/details-full/details.legacy.json';
import detailsFullDetailsNew from '../../fixtures/details-full/details.new.json';
import detailsFullLegacy from '../../fixtures/details-full/legacy.json';
import detailsFullMeta from '../../fixtures/details-full/meta.json';
import detailsFullNew from '../../fixtures/details-full/new.json';
import detailsFullRequest from '../../fixtures/details-full/request.json';
import matchesMainOnlyDetailsLegacy from '../../fixtures/matches-main-only/details.legacy.json';
import matchesMainOnlyDetailsNew from '../../fixtures/matches-main-only/details.new.json';
import matchesMainOnlyLegacy from '../../fixtures/matches-main-only/legacy.json';
import matchesMainOnlyMeta from '../../fixtures/matches-main-only/meta.json';
import matchesMainOnlyNew from '../../fixtures/matches-main-only/new.json';
import matchesMainOnlyRequest from '../../fixtures/matches-main-only/request.json';
import noSecondaryTextDetailsLegacy from '../../fixtures/no-secondary-text/details.legacy.json';
import noSecondaryTextDetailsNew from '../../fixtures/no-secondary-text/details.new.json';
import noSecondaryTextLegacy from '../../fixtures/no-secondary-text/legacy.json';
import noSecondaryTextMeta from '../../fixtures/no-secondary-text/meta.json';
import noSecondaryTextNew from '../../fixtures/no-secondary-text/new.json';
import noSecondaryTextRequest from '../../fixtures/no-secondary-text/request.json';
import parisGeocodeDetailsLegacy from '../../fixtures/paris-geocode/details.legacy.json';
import parisGeocodeDetailsNew from '../../fixtures/paris-geocode/details.new.json';
import parisGeocodeLegacy from '../../fixtures/paris-geocode/legacy.json';
import parisGeocodeMeta from '../../fixtures/paris-geocode/meta.json';
import parisGeocodeNew from '../../fixtures/paris-geocode/new.json';
import parisGeocodeRequest from '../../fixtures/paris-geocode/request.json';
import rpaMockSuggestionsDetailsLegacy from '../../fixtures/rpa-mock-suggestions/details.legacy.json';
import rpaMockSuggestionsDetailsNew from '../../fixtures/rpa-mock-suggestions/details.new.json';
import rpaMockSuggestionsLegacy from '../../fixtures/rpa-mock-suggestions/legacy.json';
import rpaMockSuggestionsMeta from '../../fixtures/rpa-mock-suggestions/meta.json';
import rpaMockSuggestionsNew from '../../fixtures/rpa-mock-suggestions/new.json';
import rpaMockSuggestionsRequest from '../../fixtures/rpa-mock-suggestions/request.json';
import sfGeocodeDetailsLegacy from '../../fixtures/sf-geocode/details.legacy.json';
import sfGeocodeDetailsNew from '../../fixtures/sf-geocode/details.new.json';
import sfGeocodeGeocode from '../../fixtures/sf-geocode/geocode.json';
import sfGeocodeLegacy from '../../fixtures/sf-geocode/legacy.json';
import sfGeocodeMeta from '../../fixtures/sf-geocode/meta.json';
import sfGeocodeNew from '../../fixtures/sf-geocode/new.json';
import sfGeocodeRequest from '../../fixtures/sf-geocode/request.json';
import zeroResultsDetailsLegacy from '../../fixtures/zero-results/details.legacy.json';
import zeroResultsDetailsNew from '../../fixtures/zero-results/details.new.json';
import zeroResultsLegacy from '../../fixtures/zero-results/legacy.json';
import zeroResultsMeta from '../../fixtures/zero-results/meta.json';
import zeroResultsNew from '../../fixtures/zero-results/new.json';
import zeroResultsRequest from '../../fixtures/zero-results/request.json';
import type { FakeControl, Fixture, LegacyControl } from './types';

type FixtureData = Omit<Fixture, 'slug'>;

const FIXTURES = new Map<string, FixtureData>(
  Object.entries({
    'paris-geocode': {
      request: parisGeocodeRequest,
      legacy: parisGeocodeLegacy,
      new: parisGeocodeNew,
      detailsLegacy: parisGeocodeDetailsLegacy,
      detailsNew: parisGeocodeDetailsNew,
      meta: parisGeocodeMeta,
      geocode: null,
    },
    amoeba: {
      request: amoebaRequest,
      legacy: amoebaLegacy,
      new: amoebaNew,
      detailsLegacy: amoebaDetailsLegacy,
      detailsNew: amoebaDetailsNew,
      meta: amoebaMeta,
      geocode: null,
    },
    'rpa-mock-suggestions': {
      request: rpaMockSuggestionsRequest,
      legacy: rpaMockSuggestionsLegacy,
      new: rpaMockSuggestionsNew,
      detailsLegacy: rpaMockSuggestionsDetailsLegacy,
      detailsNew: rpaMockSuggestionsDetailsNew,
      meta: rpaMockSuggestionsMeta,
      geocode: null,
    },
    'sf-geocode': {
      request: sfGeocodeRequest,
      legacy: sfGeocodeLegacy,
      new: sfGeocodeNew,
      detailsLegacy: sfGeocodeDetailsLegacy,
      detailsNew: sfGeocodeDetailsNew,
      meta: sfGeocodeMeta,
      geocode: sfGeocodeGeocode,
    },
    'details-full': {
      request: detailsFullRequest,
      legacy: detailsFullLegacy,
      new: detailsFullNew,
      detailsLegacy: detailsFullDetailsLegacy,
      detailsNew: detailsFullDetailsNew,
      meta: detailsFullMeta,
      geocode: null,
    },
    'zero-results': {
      request: zeroResultsRequest,
      legacy: zeroResultsLegacy,
      new: zeroResultsNew,
      detailsLegacy: zeroResultsDetailsLegacy,
      detailsNew: zeroResultsDetailsNew,
      meta: zeroResultsMeta,
      geocode: null,
    },
    'no-secondary-text': {
      request: noSecondaryTextRequest,
      legacy: noSecondaryTextLegacy,
      new: noSecondaryTextNew,
      detailsLegacy: noSecondaryTextDetailsLegacy,
      detailsNew: noSecondaryTextDetailsNew,
      meta: noSecondaryTextMeta,
      geocode: null,
    },
    'matches-main-only': {
      request: matchesMainOnlyRequest,
      legacy: matchesMainOnlyLegacy,
      new: matchesMainOnlyNew,
      detailsLegacy: matchesMainOnlyDetailsLegacy,
      detailsNew: matchesMainOnlyDetailsNew,
      meta: matchesMainOnlyMeta,
      geocode: null,
    },
  } as unknown as Record<string, FixtureData>),
);

export function loadFixture(slug: string): Fixture {
  const data = FIXTURES.get(slug);
  if (!data) throw new Error(`Unknown fixture: ${slug}`);
  return { slug, ...(JSON.parse(JSON.stringify(data)) as FixtureData) };
}

export function applyFixture(control: FakeControl | LegacyControl, fixture: Fixture): void {
  const input = fixture.request.input;
  if ('onSuggest' in control) {
    control.onSuggest(input, fixture.new.suggestions);
    if (fixture.detailsNew) control.onFetchFields(fixture.detailsNew.id, fixture.detailsNew);
  } else {
    const { predictions, status } = fixture.legacy;
    control.onPredictions(input, status === 'OK' ? predictions : status);
    const placeId = fixture.detailsLegacy?.place_id;
    if (fixture.detailsLegacy && placeId) control.onDetails(placeId, fixture.detailsLegacy);
  }
  if (fixture.geocode) registerGeocode(control, input, fixture.geocode);
}

function registerGeocode(
  control: FakeControl | LegacyControl,
  address: string,
  results: google.maps.GeocoderResult[],
): void {
  control.onGeocode(address, results);
  const placeIds = Array.from(new Set(results.map((result) => result.place_id)));
  for (const placeId of placeIds) {
    control.onGeocode(
      placeId,
      results.filter((result) => result.place_id === placeId),
    );
  }
}
