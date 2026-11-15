import { describe, expect, it } from 'vitest';
import { fetchDetails } from '../src/details';
import { fetchPredictions } from '../src/predictions';
import { createFakeGoogle } from '../src/testing/fake-new';
import { loadFixture } from '../src/testing/fixtures';

type Lib = google.maps.PlacesLibrary;
type Prediction = google.maps.places.AutocompletePrediction;

const SLUGS = [
  'paris-geocode',
  'amoeba',
  'rpa-mock-suggestions',
  'sf-geocode',
  'details-full',
  'zero-results',
  'no-secondary-text',
  'matches-main-only',
];

const DERIVED_LEGACY_SLUGS = SLUGS.filter((slug) => loadFixture(slug).meta.derived === 'legacy');

const DETAIL_SLUGS = SLUGS.filter((slug) => loadFixture(slug).detailsLegacy !== null);

function setup() {
  const fake = createFakeGoogle();
  return { ...fake, places: fake.google.maps.places as unknown as Lib };
}

function strict(p: Prediction) {
  return {
    place_id: p.place_id,
    description: p.description,
    main_text: p.structured_formatting.main_text,
    secondary_text: p.structured_formatting.secondary_text,
    matched_substrings: p.matched_substrings,
    main_text_matched_substrings: p.structured_formatting.main_text_matched_substrings,
  };
}

function derived(p: Prediction) {
  return { types: p.types, terms: p.terms, distance_meters: p.distance_meters };
}

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe.each(SLUGS)('fixture %s: predictions', (slug) => {
  it('the new half converts to the legacy half on the strict keys', async () => {
    const fixture = loadFixture(slug);
    const { places, control } = setup();
    control.onSuggest(fixture.request.input, fixture.new.suggestions);
    const { status, predictions } = await fetchPredictions(places, fixture.request);
    expect(status).toBe(fixture.legacy.status);
    expect(predictions.map(strict)).toEqual(fixture.legacy.predictions.map(strict));
  });
});

describe.each(DERIVED_LEGACY_SLUGS)('fixture %s: derived legacy half', (slug) => {
  it('also matches types, terms and distance_meters', async () => {
    const fixture = loadFixture(slug);
    const { places, control } = setup();
    control.onSuggest(fixture.request.input, fixture.new.suggestions);
    const { predictions } = await fetchPredictions(places, fixture.request);
    expect(predictions.map(derived)).toEqual(fixture.legacy.predictions.map(derived));
  });
});

describe.each(DETAIL_SLUGS)('fixture %s: details', (slug) => {
  it('fetching the legacy keys gives the legacy details', async () => {
    const fixture = loadFixture(slug);
    const detailsNew = fixture.detailsNew as NonNullable<typeof fixture.detailsNew>;
    const detailsLegacy = fixture.detailsLegacy as google.maps.places.PlaceResult;
    const { places, control } = setup();
    control.onFetchFields(detailsNew.id, detailsNew);
    const { status, result } = await fetchDetails(places, {
      placeId: detailsNew.id,
      fields: Object.keys(detailsLegacy),
    });
    expect(status).toBe('OK');
    expect(plain(result)).toEqual(detailsLegacy);
  });

  it('fetching with no fields gives the same legacy details', async () => {
    const fixture = loadFixture(slug);
    const detailsNew = fixture.detailsNew as NonNullable<typeof fixture.detailsNew>;
    const { places, control } = setup();
    control.onFetchFields(detailsNew.id, detailsNew);
    const { status, result } = await fetchDetails(places, { placeId: detailsNew.id });
    expect(status).toBe('OK');
    expect(plain(result)).toEqual(fixture.detailsLegacy);
  });

  it('geometry keeps LatLng and LatLngBounds instances', async () => {
    const fixture = loadFixture(slug);
    const detailsNew = fixture.detailsNew as NonNullable<typeof fixture.detailsNew>;
    const { places, control } = setup();
    control.onFetchFields(detailsNew.id, detailsNew);
    const { result } = await fetchDetails(places, { placeId: detailsNew.id, fields: ['geometry'] });
    expect(typeof result?.geometry?.location?.lat).toBe('function');
    expect(typeof result?.geometry?.viewport?.getNorthEast).toBe('function');
  });
});

describe('fixture details-full: function members', () => {
  it('photos[].getUrl and opening_hours.isOpen are functions', async () => {
    const fixture = loadFixture('details-full');
    const detailsNew = fixture.detailsNew as NonNullable<typeof fixture.detailsNew>;
    const { places, control } = setup();
    control.onFetchFields(detailsNew.id, detailsNew);
    const { result } = await fetchDetails(places, { placeId: detailsNew.id });
    expect(result?.photos?.[0]?.getUrl({ maxWidth: 100 })).toBe(
      'https://photos.places.test/synthetic-details-full/0?maxWidth=100',
    );
    expect(result?.opening_hours?.isOpen()).toBeUndefined();
  });
});

describe('fixture list', () => {
  it('covers every slug with details', () => {
    expect(DETAIL_SLUGS).toEqual(['sf-geocode', 'details-full']);
  });

  it('knows which slugs have a derived legacy half', () => {
    expect(DERIVED_LEGACY_SLUGS).toEqual([
      'amoeba',
      'details-full',
      'zero-results',
      'no-secondary-text',
      'matches-main-only',
    ]);
  });
});
