import { describe, expect, it } from 'vitest';
import { ALL_PLACE_FIELDS, LEGACY_FIELD_MAP, toPlaceFields } from '../src/fields';

const CORE_13 = [
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
];

describe('toPlaceFields: full list (CORE-13)', () => {
  it('no argument asks for the full list in order', () => {
    expect(toPlaceFields()).toEqual({ fields: CORE_13, unsupported: [] });
  });

  it('[] asks for the full list', () => {
    expect(toPlaceFields([])).toEqual({ fields: CORE_13, unsupported: [] });
  });

  it("['ALL'] asks for the full list", () => {
    expect(toPlaceFields(['ALL'])).toEqual({ fields: CORE_13, unsupported: [] });
  });

  it("'ALL' with other names still asks for the full list and reports the unsupported ones", () => {
    expect(toPlaceFields(['name', 'ALL', 'icon'])).toEqual({
      fields: CORE_13,
      unsupported: ['icon'],
    });
  });

  it('never returns the shared constant', () => {
    const out = toPlaceFields();
    out.fields.push('x');
    expect(ALL_PLACE_FIELDS).toEqual(CORE_13);
  });

  it('the constant matches the field map, in map order', () => {
    expect(ALL_PLACE_FIELDS).toEqual(CORE_13);
    const fromMap: string[] = [];
    for (const name of Object.keys(LEGACY_FIELD_MAP)) {
      for (const f of LEGACY_FIELD_MAP[name] ?? []) {
        if (fromMap.indexOf(f) === -1) fromMap.push(f);
      }
    }
    expect(fromMap).toEqual(CORE_13);
  });
});

describe('toPlaceFields: legacy name by legacy name', () => {
  it.each([
    ['address_components', ['addressComponents']],
    ['adr_address', ['adrFormatAddress']],
    ['formatted_address', ['formattedAddress']],
    ['geometry', ['location', 'viewport']],
    ['geometry.location', ['location']],
    ['geometry.viewport', ['viewport']],
    ['plus_code', ['plusCode']],
    ['types', ['types']],
    ['place_id', ['id']],
    ['photos', ['photos']],
    ['name', ['displayName']],
    ['business_status', ['businessStatus']],
    ['utc_offset_minutes', ['utcOffsetMinutes']],
    ['icon_background_color', ['iconBackgroundColor']],
    ['icon_mask_base_uri', ['svgIconMaskURI']],
    ['opening_hours', ['regularOpeningHours']],
    ['price_level', ['priceLevel']],
    ['rating', ['rating']],
    ['user_ratings_total', ['userRatingCount']],
    ['website', ['websiteURI']],
    ['international_phone_number', ['internationalPhoneNumber']],
    ['formatted_phone_number', ['nationalPhoneNumber']],
    ['reviews', ['reviews']],
    ['url', ['googleMapsURI']],
    ['vicinity', ['shortFormattedAddress']],
    ['html_attributions', ['attributions']],
  ])('%s maps to %j', (legacy, fields) => {
    expect(toPlaceFields([legacy])).toEqual({ fields, unsupported: [] });
  });
});

describe('toPlaceFields: names without successor and unknown names', () => {
  it.each([
    'icon',
    'aspects',
    'permanently_closed',
    'utc_offset',
    'opening_hours.open_now',
    'opening_hours.periods.nextDate',
    'opening_hours.periods[].nextDate',
  ])('%s is unsupported and never sent (CORE-12)', (name) => {
    expect(toPlaceFields([name])).toEqual({ fields: [], unsupported: [name] });
  });

  it('unknown names are unsupported, prototype keys included', () => {
    expect(toPlaceFields(['foo', 'toString', 'constructor', '__proto__', ''])).toEqual({
      fields: [],
      unsupported: ['foo', 'toString', 'constructor', '__proto__', ''],
    });
  });

  it('new-API names are not accepted as legacy names', () => {
    expect(toPlaceFields(['displayName', '*'])).toEqual({
      fields: [],
      unsupported: ['displayName', '*'],
    });
  });
});

describe('toPlaceFields: order and duplicates', () => {
  it('keeps request order', () => {
    expect(toPlaceFields(['name', 'place_id', 'formatted_address']).fields).toEqual([
      'displayName',
      'id',
      'formattedAddress',
    ]);
  });

  it('removes duplicates from overlapping and repeated names', () => {
    expect(
      toPlaceFields(['geometry.location', 'geometry', 'geometry.viewport', 'name', 'name']),
    ).toEqual({ fields: ['location', 'viewport', 'displayName'], unsupported: [] });
  });

  it('removes duplicates from unsupported names', () => {
    expect(toPlaceFields(['icon', 'name', 'icon'])).toEqual({
      fields: ['displayName'],
      unsupported: ['icon'],
    });
  });

  it('the default fields of the widget package are Essentials plus id', () => {
    expect(
      toPlaceFields(['address_components', 'geometry.location', 'place_id', 'formatted_address']),
    ).toEqual({
      fields: ['addressComponents', 'location', 'id', 'formattedAddress'],
      unsupported: [],
    });
  });
});
