import { describe, expect, it } from 'vitest';
import { applyFixture, loadFixture } from '../../src/testing/fixtures';
import type {
  FakeControl,
  Fixture,
  LegacyControl,
  PlaceJson,
  SuggestionJson,
  TextJson,
} from '../../src/testing/types';

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { eager: true; query: '?raw'; import: 'default' },
    ): Record<string, string>;
  }
}

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

const FILES = [
  'details.legacy.json',
  'details.new.json',
  'legacy.json',
  'meta.json',
  'new.json',
  'request.json',
];

const RAW = import.meta.glob('../../fixtures/**/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const NOTICE = import.meta.glob('../../fixtures/NOTICE.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const GOOGLE_LEGACY_DOC =
  'https://developers.google.com/maps/documentation/places/web-service/legacy/autocomplete';
const GOOGLE_NEW_DOC =
  'https://developers.google.com/maps/documentation/places/web-service/place-autocomplete';

function toSubstring(range: { startOffset?: number; endOffset: number }) {
  const offset = range.startOffset ?? 0;
  return { length: range.endOffset - offset, offset };
}

function splitTerms(text: string) {
  let offset = 0;
  return text.split(', ').map((value) => {
    const term = { offset, value };
    offset += value.length + 2;
    return term;
  });
}

function convertSuggestion(suggestion: SuggestionJson) {
  const p = suggestion.placePrediction;
  if (!p) throw new Error('fixture suggestion without placePrediction');
  const main: TextJson | undefined = p.structuredFormat?.mainText;
  const secondary = p.structuredFormat?.secondaryText;
  const textMatches = p.text.matches ?? [];
  const mainMatches = main?.matches ?? [];
  const useMain =
    textMatches.length === 0 &&
    mainMatches.length > 0 &&
    main !== undefined &&
    p.text.text.startsWith(main.text);
  const out: Record<string, unknown> = {
    description: p.text.text,
    matched_substrings: (useMain ? mainMatches : textMatches).map(toSubstring),
    place_id: p.placeId,
    structured_formatting: {
      main_text: main ? main.text : p.text.text,
      main_text_matched_substrings: mainMatches.map(toSubstring),
      secondary_text: secondary ? secondary.text : '',
    },
    terms: splitTerms(p.text.text),
    types: [...(p.types ?? [])],
  };
  if (p.distanceMeters != null) out.distance_meters = p.distanceMeters;
  return out;
}

const PRICE: Record<string, number> = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

const link = (text: string, uri: string | null | undefined) =>
  uri ? `<a href="${uri}">${text}</a>` : text;

const point = (p: { day: number; hour: number; minute: number }) => ({
  day: p.day,
  hours: p.hour,
  minutes: p.minute,
  time: `${String(p.hour).padStart(2, '0')}${String(p.minute).padStart(2, '0')}`,
});

function convertDetails(d: PlaceJson) {
  const out: Record<string, unknown> = {};
  if (d.addressComponents) {
    out.address_components = d.addressComponents.map((c) => ({
      long_name: c.longText ?? '',
      short_name: c.shortText ?? '',
      types: c.types,
    }));
  }
  if ('adrFormatAddress' in d) out.adr_address = d.adrFormatAddress;
  if ('formattedAddress' in d) out.formatted_address = d.formattedAddress;
  const geometry: Record<string, unknown> = {};
  if ('location' in d) geometry.location = d.location;
  if ('viewport' in d) geometry.viewport = d.viewport;
  if (Object.keys(geometry).length > 0) out.geometry = geometry;
  if (d.plusCode) {
    out.plus_code = { global_code: d.plusCode.globalCode, compound_code: d.plusCode.compoundCode };
  }
  if (d.types) out.types = [...d.types];
  out.place_id = d.id;
  if (d.photos) {
    out.photos = d.photos.map((photo) => ({
      height: photo.heightPx,
      width: photo.widthPx,
      html_attributions: photo.authorAttributions.map((a) => link(a.displayName, a.uri)),
    }));
  }
  if ('displayName' in d) out.name = d.displayName;
  if ('businessStatus' in d) out.business_status = d.businessStatus;
  if ('utcOffsetMinutes' in d) out.utc_offset_minutes = d.utcOffsetMinutes;
  if ('iconBackgroundColor' in d) out.icon_background_color = d.iconBackgroundColor;
  if ('svgIconMaskURI' in d) out.icon_mask_base_uri = d.svgIconMaskURI;
  if (d.regularOpeningHours) {
    out.opening_hours = {
      periods: d.regularOpeningHours.periods.map((period) => ({
        open: point(period.open),
        close: period.close && point(period.close),
      })),
      weekday_text: d.regularOpeningHours.weekdayDescriptions,
    };
  }
  if (d.priceLevel && d.priceLevel in PRICE) out.price_level = PRICE[d.priceLevel];
  if ('rating' in d) out.rating = d.rating;
  if ('userRatingCount' in d) out.user_ratings_total = d.userRatingCount;
  if ('websiteURI' in d) out.website = d.websiteURI;
  if ('internationalPhoneNumber' in d) out.international_phone_number = d.internationalPhoneNumber;
  if ('nationalPhoneNumber' in d) out.formatted_phone_number = d.nationalPhoneNumber;
  if (d.reviews) {
    out.reviews = d.reviews.map((r) => ({
      author_name: r.authorAttribution?.displayName ?? '',
      author_url: r.authorAttribution?.uri,
      profile_photo_url: r.authorAttribution?.photoURI ?? '',
      language: r.textLanguageCode ?? '',
      rating: r.rating,
      relative_time_description: r.relativePublishTimeDescription ?? '',
      text: r.text ?? '',
      time: r.publishTime ? Math.floor(new Date(r.publishTime).getTime() / 1000) : 0,
    }));
  }
  if ('googleMapsURI' in d) out.url = d.googleMapsURI;
  if ('shortFormattedAddress' in d) out.vicinity = d.shortFormattedAddress;
  if (d.attributions) {
    out.html_attributions = d.attributions.map((a) => link(a.provider, a.providerURI));
  }
  return out;
}

function rawFile(slug: string, name: string): string {
  const raw = RAW[`../../fixtures/${slug}/${name}`];
  if (raw === undefined) throw new Error(`missing ${slug}/${name}`);
  return raw;
}

describe('fixture files', () => {
  it('has exactly the eight slugs, each with its six files, plus geocode.json for sf-geocode', () => {
    const expected = SLUGS.flatMap((slug) => FILES.map((file) => `${slug}/${file}`));
    expected.push('sf-geocode/geocode.json');
    const actual = Object.keys(RAW).map((path) => path.replace('../../fixtures/', ''));
    expect(actual.sort()).toEqual(expected.sort());
  });

  it.each(Object.keys(RAW))('%s is well-formed JSON ending in a newline', (path) => {
    const raw = RAW[path] as string;
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('loadFixture', () => {
  it.each(SLUGS)('loads %s with every part', (slug) => {
    const fixture = loadFixture(slug);
    expect(fixture.slug).toBe(slug);
    expect(Object.keys(fixture).sort()).toEqual(
      ['detailsLegacy', 'detailsNew', 'geocode', 'legacy', 'meta', 'new', 'request', 'slug'].sort(),
    );
    expect(fixture.request).toEqual(JSON.parse(rawFile(slug, 'request.json')));
    expect(fixture.legacy).toEqual(JSON.parse(rawFile(slug, 'legacy.json')));
    expect(fixture.new).toEqual(JSON.parse(rawFile(slug, 'new.json')));
    expect(fixture.detailsLegacy).toEqual(JSON.parse(rawFile(slug, 'details.legacy.json')));
    expect(fixture.detailsNew).toEqual(JSON.parse(rawFile(slug, 'details.new.json')));
    expect(fixture.meta).toEqual(JSON.parse(rawFile(slug, 'meta.json')));
    expect(typeof fixture.request.input).toBe('string');
  });

  it('throws for an unknown slug, including prototype keys', () => {
    expect(() => loadFixture('nope')).toThrow(new Error('Unknown fixture: nope'));
    expect(() => loadFixture('toString')).toThrow(new Error('Unknown fixture: toString'));
  });

  it('returns deep copies that callers can mutate', () => {
    const first = loadFixture('details-full');
    const pristine = loadFixture('details-full');
    first.legacy.predictions[0]?.terms.push({ offset: 99, value: 'x' });
    if (first.detailsNew?.types) first.detailsNew.types.length = 0;
    first.request.input = 'changed';
    const again = loadFixture('details-full');
    expect(again).toEqual(pristine);
    expect(again.request).not.toBe(pristine.request);
  });

  it('only sf-geocode has geocode results, copied verbatim from GEOCODE_RESULT', () => {
    for (const slug of SLUGS) {
      if (slug !== 'sf-geocode') expect(loadFixture(slug).geocode).toBeNull();
    }
    const geocode = loadFixture('sf-geocode').geocode;
    expect(geocode).toHaveLength(1);
    expect(geocode?.[0]?.place_id).toBe('ChIJIQBpAG2ahYAR_6128GcTUEo');
    expect(geocode?.[0]?.formatted_address).toBe('San Francisco, CA, USA');
    expect(geocode?.[0]?.geometry.location).toEqual({ lat: 37.7749295, lng: -122.41941550000001 });
  });
});

describe('fixture content', () => {
  it.each(SLUGS)('%s: the legacy half is toLegacyPrediction applied to the new half', (slug) => {
    const fixture = loadFixture(slug);
    expect(fixture.legacy.predictions).toEqual(fixture.new.suggestions.map(convertSuggestion));
    expect(fixture.legacy.status).toBe(fixture.new.suggestions.length > 0 ? 'OK' : 'ZERO_RESULTS');
  });

  it.each(SLUGS)('%s: details.legacy is toLegacyPlaceResult applied to details.new', (slug) => {
    const { detailsLegacy, detailsNew } = loadFixture(slug);
    expect(detailsLegacy === null).toBe(detailsNew === null);
    if (detailsNew) expect(detailsLegacy).toEqual(convertDetails(detailsNew));
  });

  it.each(SLUGS)('%s: REST shape omits startOffset 0 and keeps place in sync', (slug) => {
    for (const suggestion of loadFixture(slug).new.suggestions) {
      const p = suggestion.placePrediction;
      expect(p).toBeTruthy();
      if (!p) continue;
      if (p.place !== undefined) expect(p.place).toBe(`places/${p.placeId}`);
      const ranges = [
        ...(p.text.matches ?? []),
        ...(p.structuredFormat?.mainText?.matches ?? []),
        ...(p.structuredFormat?.secondaryText?.matches ?? []),
      ];
      for (const range of ranges) expect(range.startOffset).not.toBe(0);
    }
  });

  it('paris-geocode keeps the documented legacy predictions', () => {
    const { request, legacy } = loadFixture('paris-geocode');
    expect(request).toEqual({ input: 'Paris', types: ['geocode'] });
    expect(legacy.predictions).toHaveLength(5);
    expect(legacy.predictions[0]).toMatchObject({
      description: 'Paris, France',
      place_id: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
      terms: [
        { offset: 0, value: 'Paris' },
        { offset: 7, value: 'France' },
      ],
      types: ['locality', 'political', 'geocode'],
    });
  });

  it('amoeba keeps the documented new suggestion', () => {
    const p = loadFixture('amoeba').new.suggestions[0]?.placePrediction;
    expect(p?.text).toEqual({
      text: 'Amoeba Music, Haight Street, San Francisco, CA, USA',
      matches: [{ endOffset: 6 }],
    });
    expect(p?.structuredFormat?.mainText).toEqual({
      text: 'Amoeba Music',
      matches: [{ endOffset: 6 }],
    });
    expect(p?.types).toEqual([
      'electronics_store',
      'point_of_interest',
      'store',
      'establishment',
      'home_goods_store',
    ]);
  });

  it('rpa-mock-suggestions holds the five mockSuggestions', () => {
    const predictions = loadFixture('rpa-mock-suggestions').legacy.predictions;
    expect(predictions.map((p) => p.place_id)).toEqual([
      'ChIJIQBpAG2ahYAR_6128GcTUEo',
      'ChIJVVVVVYx3j4ARP-3NGldc8qQ',
      'ChIJmz3ukEbx0YUR_iiKUJOxHUA',
      'ChIJVVVVVYx3j4ARyN7qnq2JceQ',
      'ChIJ3bwFNq7DK4QR1ZorLLDndeA',
    ]);
    expect(predictions[2]?.matched_substrings).toEqual([{ length: 8, offset: 0 }]);
  });

  it('details-full has a value for every mapped Place field', () => {
    const { detailsNew, detailsLegacy } = loadFixture('details-full');
    expect(Object.keys(detailsNew ?? {}).sort()).toEqual(
      [
        'addressComponents',
        'adrFormatAddress',
        'formattedAddress',
        'location',
        'viewport',
        'plusCode',
        'types',
        'id',
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
      ].sort(),
    );
    for (const value of Object.values(detailsNew ?? {})) expect(value).not.toBeNull();
    expect(Object.keys(detailsLegacy ?? {})).toHaveLength(24);
    expect(detailsLegacy?.opening_hours).not.toHaveProperty('isOpen');
    expect(detailsLegacy?.photos?.[0]).not.toHaveProperty('getUrl');
    expect(loadFixture('details-full').legacy.predictions[0]?.distance_meters).toBe(120);
  });

  it('zero-results, no-secondary-text and matches-main-only show their edge case', () => {
    expect(loadFixture('zero-results').legacy).toEqual({ predictions: [], status: 'ZERO_RESULTS' });
    const noSecondary = loadFixture('no-secondary-text');
    expect(noSecondary.new.suggestions[0]?.placePrediction?.structuredFormat).not.toHaveProperty(
      'secondaryText',
    );
    expect(noSecondary.legacy.predictions[0]?.structured_formatting.secondary_text).toBe('');
    const mainOnly = loadFixture('matches-main-only');
    expect(mainOnly.new.suggestions[0]?.placePrediction?.text.matches).toEqual([]);
    expect(mainOnly.legacy.predictions[0]?.matched_substrings).toEqual([
      { length: 5, offset: 0 },
      { length: 3, offset: 6 },
    ]);
  });
});

describe('meta and NOTICE.md', () => {
  const expectedMeta: Record<string, { derived: string; copyright: string; source: string }> = {
    'paris-geocode': { derived: 'new', copyright: 'Google LLC', source: GOOGLE_LEGACY_DOC },
    amoeba: { derived: 'legacy', copyright: 'Google LLC', source: GOOGLE_NEW_DOC },
    'rpa-mock-suggestions': {
      derived: 'new',
      copyright: 'Copyright (c) 2016 Ken Hibino',
      source: 'react-places-autocomplete 7.3.0',
    },
    'sf-geocode': {
      derived: 'new',
      copyright: 'Copyright (c) 2016 Ken Hibino',
      source: 'react-places-autocomplete 7.3.0',
    },
  };

  it.each(SLUGS)('%s has a valid meta whose derived half matches its source', (slug) => {
    const { meta } = loadFixture(slug);
    expect(Object.keys(meta).sort()).toEqual([
      'copyright',
      'derived',
      'license',
      'notes',
      'source',
    ]);
    for (const key of ['source', 'license', 'copyright', 'notes'] as const) {
      expect(meta[key].length).toBeGreaterThan(0);
    }
    expect(['legacy', 'new', null]).toContain(meta.derived);
    const expected = expectedMeta[slug] ?? {
      derived: 'legacy',
      copyright: 'Copyright (c) 2026',
      source: 'Synthetic data written for this project',
    };
    expect(meta.derived).toBe(expected.derived);
    expect(meta.copyright.startsWith(expected.copyright)).toBe(true);
    expect(meta.source.startsWith(expected.source)).toBe(true);
    if (meta.copyright === 'Google LLC') expect(meta.license).toMatch(/^CC-BY-4\.0/);
    else expect(meta.license).toBe('MIT');
  });

  it('details-full documents the functions JSON cannot hold', () => {
    const { notes } = loadFixture('details-full').meta;
    expect(notes).toContain('isOpen');
    expect(notes).toContain('getUrl');
  });

  it('NOTICE.md names every slug with its source, holder and derived half', () => {
    const notice = NOTICE['../../fixtures/NOTICE.md'];
    expect(notice).toBeDefined();
    for (const slug of SLUGS) {
      const { meta } = loadFixture(slug);
      const section = notice?.split(/^## /m).find((part) => part.startsWith(`\`${slug}\``));
      expect(section, slug).toBeDefined();
      expect(section).toContain(meta.copyright);
      expect(section).toContain(meta.license.split(' ')[0]);
      expect(section).toContain(`Derived half: ${meta.derived ?? 'none'}`);
      if (meta.source.startsWith('https://')) expect(section).toContain(meta.source);
    }
    expect(notice).toMatch(/test the converter/);
  });
});

function recordingNew() {
  const log: unknown[][] = [];
  const control = {
    onSuggest: (...args: unknown[]) => log.push(['onSuggest', ...args]),
    onFetchFields: (...args: unknown[]) => log.push(['onFetchFields', ...args]),
    onGeocode: (...args: unknown[]) => log.push(['onGeocode', ...args]),
    pending: [],
    calls: [],
    sessions: new Map(),
    reset: () => undefined,
  } satisfies FakeControl;
  return { control: control as FakeControl, log };
}

function recordingLegacy() {
  const log: unknown[][] = [];
  const control = {
    onPredictions: (...args: unknown[]) => log.push(['onPredictions', ...args]),
    onDetails: (...args: unknown[]) => log.push(['onDetails', ...args]),
    onGeocode: (...args: unknown[]) => log.push(['onGeocode', ...args]),
    pending: [],
    calls: [],
    selectPlace: () => undefined,
    enterWithoutSelection: () => undefined,
    reset: () => undefined,
  } satisfies LegacyControl;
  return { control: control as LegacyControl, log };
}

describe('applyFixture', () => {
  it('registers suggestions only on the new fake when there are no details', () => {
    const fixture = loadFixture('amoeba');
    const { control, log } = recordingNew();
    applyFixture(control, fixture);
    expect(log).toEqual([['onSuggest', 'Amoeba', fixture.new.suggestions]]);
  });

  it('registers suggestions, details and geocode on the new fake', () => {
    const fixture = loadFixture('sf-geocode');
    const { control, log } = recordingNew();
    applyFixture(control, fixture);
    expect(log).toEqual([
      ['onSuggest', 'San Francisco', fixture.new.suggestions],
      ['onFetchFields', 'ChIJIQBpAG2ahYAR_6128GcTUEo', fixture.detailsNew],
      ['onGeocode', 'San Francisco', fixture.geocode],
      ['onGeocode', 'ChIJIQBpAG2ahYAR_6128GcTUEo', fixture.geocode],
    ]);
  });

  it('registers predictions, details and geocode on the legacy fake', () => {
    const fixture = loadFixture('sf-geocode');
    const { control, log } = recordingLegacy();
    applyFixture(control, fixture);
    expect(log).toEqual([
      ['onPredictions', 'San Francisco', fixture.legacy.predictions],
      ['onDetails', 'ChIJIQBpAG2ahYAR_6128GcTUEo', fixture.detailsLegacy],
      ['onGeocode', 'San Francisco', fixture.geocode],
      ['onGeocode', 'ChIJIQBpAG2ahYAR_6128GcTUEo', fixture.geocode],
    ]);
  });

  it('passes a non-OK legacy status instead of the predictions', () => {
    const { control, log } = recordingLegacy();
    applyFixture(control, loadFixture('zero-results'));
    expect(log).toEqual([['onPredictions', 'qqqzzzxxx', 'ZERO_RESULTS']]);
  });

  it('registers details-full details on both fakes', () => {
    const fixture = loadFixture('details-full');
    const fresh = recordingNew();
    applyFixture(fresh.control, fixture);
    expect(fresh.log[1]).toEqual(['onFetchFields', 'synthetic-details-full', fixture.detailsNew]);
    const legacy = recordingLegacy();
    applyFixture(legacy.control, fixture);
    expect(legacy.log[1]).toEqual(['onDetails', 'synthetic-details-full', fixture.detailsLegacy]);
  });

  it('skips legacy details without a place_id', () => {
    const fixture: Fixture = { ...loadFixture('details-full'), detailsLegacy: { name: 'x' } };
    const { control, log } = recordingLegacy();
    applyFixture(control, fixture);
    expect(log.map((entry) => entry[0])).toEqual(['onPredictions']);
  });

  it('groups geocode results by placeId', () => {
    const base = loadFixture('sf-geocode');
    const first = base.geocode?.[0] as google.maps.GeocoderResult;
    const other = { ...first, place_id: 'other' };
    const fixture: Fixture = { ...base, geocode: [first, other, first] };
    const { control, log } = recordingNew();
    applyFixture(control, fixture);
    expect(log.slice(2)).toEqual([
      ['onGeocode', 'San Francisco', [first, other, first]],
      ['onGeocode', first.place_id, [first, first]],
      ['onGeocode', 'other', [other]],
    ]);
  });
});
