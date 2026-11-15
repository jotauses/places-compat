import { describe, expect, it, vi } from 'vitest';
import { toLegacyPlaceResult } from '../src/details';

type Place = google.maps.places.Place;

class FakeLatLng {
  constructor(
    readonly latValue: number,
    readonly lngValue: number,
  ) {}
  lat(): number {
    return this.latValue;
  }
  lng(): number {
    return this.lngValue;
  }
}

class FakeBounds {
  constructor(
    readonly sw: FakeLatLng,
    readonly ne: FakeLatLng,
  ) {}
}

class FakeAttribution {
  constructor(
    readonly displayNameValue: string,
    readonly uriValue: string | null,
    readonly photoValue: string | null = null,
  ) {}
  get displayName(): string {
    return this.displayNameValue;
  }
  get uri(): string | null {
    return this.uriValue;
  }
  get photoURI(): string | null {
    return this.photoValue;
  }
}

class FakePhoto {
  readonly getURI = vi.fn((opts?: google.maps.places.PhotoOptions) =>
    opts ? `https://photo/${opts.maxWidth ?? ''}x${opts.maxHeight ?? ''}` : 'https://photo/default',
  );
  constructor(
    readonly h: number,
    readonly w: number,
    readonly attrs: FakeAttribution[],
  ) {}
  get heightPx(): number {
    return this.h;
  }
  get widthPx(): number {
    return this.w;
  }
  get authorAttributions(): FakeAttribution[] {
    return this.attrs;
  }
}

class FakePlace {
  constructor(readonly data: Record<string, unknown>) {}
  #get<T>(key: string): T {
    return this.data[key] as T;
  }
  get id(): unknown {
    return this.#get('id');
  }
  get addressComponents(): unknown {
    return this.#get('addressComponents');
  }
  get adrFormatAddress(): unknown {
    return this.#get('adrFormatAddress');
  }
  get formattedAddress(): unknown {
    return this.#get('formattedAddress');
  }
  get location(): unknown {
    return this.#get('location');
  }
  get viewport(): unknown {
    return this.#get('viewport');
  }
  get plusCode(): unknown {
    return this.#get('plusCode');
  }
  get types(): unknown {
    return this.#get('types');
  }
  get photos(): unknown {
    return this.#get('photos');
  }
  get displayName(): unknown {
    return this.#get('displayName');
  }
  get businessStatus(): unknown {
    return this.#get('businessStatus');
  }
  get utcOffsetMinutes(): unknown {
    return this.#get('utcOffsetMinutes');
  }
  get iconBackgroundColor(): unknown {
    return this.#get('iconBackgroundColor');
  }
  get svgIconMaskURI(): unknown {
    return this.#get('svgIconMaskURI');
  }
  get regularOpeningHours(): unknown {
    return this.#get('regularOpeningHours');
  }
  get priceLevel(): unknown {
    return this.#get('priceLevel');
  }
  get rating(): unknown {
    return this.#get('rating');
  }
  get userRatingCount(): unknown {
    return this.#get('userRatingCount');
  }
  get websiteURI(): unknown {
    return this.#get('websiteURI');
  }
  get internationalPhoneNumber(): unknown {
    return this.#get('internationalPhoneNumber');
  }
  get nationalPhoneNumber(): unknown {
    return this.#get('nationalPhoneNumber');
  }
  get reviews(): unknown {
    return this.#get('reviews');
  }
  get googleMapsURI(): unknown {
    return this.#get('googleMapsURI');
  }
  get shortFormattedAddress(): unknown {
    return this.#get('shortFormattedAddress');
  }
  get attributions(): unknown {
    return this.#get('attributions');
  }
}

const place = (data: Record<string, unknown>) => new FakePlace(data) as unknown as Place;

const point = (day: number, hour: number, minute: number) => ({ day, hour, minute });

const LOCATION = new FakeLatLng(40.4168, -3.7038);
const VIEWPORT = new FakeBounds(new FakeLatLng(40.3, -3.8), new FakeLatLng(40.5, -3.6));

function fullData(): Record<string, unknown> {
  return {
    id: 'ChIJ_full',
    addressComponents: [
      { longText: 'Madrid', shortText: 'M', types: ['locality', 'political'] },
      { longText: null, shortText: null, types: ['country'] },
    ],
    adrFormatAddress: '<span class="locality">Madrid</span>',
    formattedAddress: 'Madrid, Spain',
    location: LOCATION,
    viewport: VIEWPORT,
    plusCode: { globalCode: '8CGRC78X+2G', compoundCode: 'C78X+2G Madrid' },
    types: ['locality', 'political'],
    photos: [new FakePhoto(600, 800, [new FakeAttribution('Ana', 'https://maps/ana')])],
    displayName: 'Madrid',
    businessStatus: 'OPERATIONAL',
    utcOffsetMinutes: 60,
    iconBackgroundColor: '#7B9EB0',
    svgIconMaskURI: 'https://maps/icon',
    regularOpeningHours: {
      periods: [{ open: point(1, 9, 5), close: point(1, 18, 30) }],
      weekdayDescriptions: ['Monday: 9:05 AM – 6:30 PM'],
    },
    priceLevel: 'MODERATE',
    rating: 4.5,
    userRatingCount: 120,
    websiteURI: 'https://madrid.es',
    internationalPhoneNumber: '+34 910 00 00 00',
    nationalPhoneNumber: '910 00 00 00',
    reviews: [
      {
        authorAttribution: new FakeAttribution(
          'Luis',
          'https://maps/luis',
          'https://maps/luis.jpg',
        ),
        rating: 5,
        relativePublishTimeDescription: 'a week ago',
        text: 'Great',
        textLanguageCode: 'en',
        publishTime: new Date(1700000000999),
      },
    ],
    googleMapsURI: 'https://maps.google.com/?cid=1',
    shortFormattedAddress: 'Madrid',
    attributions: [{ provider: 'Acme', providerURI: 'https://acme' }],
  };
}

const ALL_KEYS = [
  'address_components',
  'adr_address',
  'formatted_address',
  'geometry',
  'plus_code',
  'types',
  'place_id',
  'photos',
  'name',
  'business_status',
  'utc_offset_minutes',
  'icon_background_color',
  'icon_mask_base_uri',
  'opening_hours',
  'price_level',
  'rating',
  'user_ratings_total',
  'website',
  'international_phone_number',
  'formatted_phone_number',
  'reviews',
  'url',
  'vicinity',
  'html_attributions',
];

describe('toLegacyPlaceResult: requested keys', () => {
  it('no legacy list rebuilds every mapped key, in map order', () => {
    expect(Object.keys(toLegacyPlaceResult(place(fullData())))).toEqual(ALL_KEYS);
  });

  it('[] and [ALL] rebuild every mapped key', () => {
    expect(Object.keys(toLegacyPlaceResult(place(fullData()), []))).toEqual(ALL_KEYS);
    expect(Object.keys(toLegacyPlaceResult(place(fullData()), ['ALL']))).toEqual(ALL_KEYS);
    expect(Object.keys(toLegacyPlaceResult(place(fullData()), ['icon', 'ALL']))).toEqual(ALL_KEYS);
  });

  it('only the requested keys are rebuilt', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['name', 'place_id'])).toEqual({
      place_id: 'ChIJ_full',
      name: 'Madrid',
    });
  });

  it('names without successor and unknown names are ignored', () => {
    expect(
      toLegacyPlaceResult(place(fullData()), ['icon', 'utc_offset', 'toString', 'foo']),
    ).toEqual({});
  });

  it('getters are only read for requested keys', () => {
    const data = fullData();
    const read: string[] = [];
    const tracked = new Proxy(data, {
      get(target, key) {
        read.push(String(key));
        return target[key as string];
      },
    });
    toLegacyPlaceResult(place(tracked), ['name']);
    expect(read).toEqual(['displayName']);
  });
});

describe('toLegacyPlaceResult: null and undefined getters', () => {
  it('a null or undefined value is not emitted, for every key', () => {
    for (const empty of [null, undefined]) {
      const data: Record<string, unknown> = { id: empty };
      for (const key of Object.keys(fullData())) data[key] = empty;
      expect(toLegacyPlaceResult(place(data))).toEqual({});
    }
  });

  it('an empty array is emitted as []', () => {
    const out = toLegacyPlaceResult(
      place({ photos: [], reviews: [], attributions: [], types: [], addressComponents: [] }),
      ['photos', 'reviews', 'html_attributions', 'types', 'address_components'],
    );
    expect(out).toEqual({
      address_components: [],
      types: [],
      photos: [],
      reviews: [],
      html_attributions: [],
    });
  });
});

describe('toLegacyPlaceResult: field by field', () => {
  it('address_components: long/short text with "" fallback, types copied', () => {
    const data = fullData();
    const out = toLegacyPlaceResult(place(data), ['address_components']);
    expect(out.address_components).toEqual([
      { long_name: 'Madrid', short_name: 'M', types: ['locality', 'political'] },
      { long_name: '', short_name: '', types: ['country'] },
    ]);
    const source = (data.addressComponents as { types: string[] }[])[0]?.types;
    expect(out.address_components?.[0]?.types).not.toBe(source);
  });

  it('adr_address: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['adr_address'])).toEqual({
      adr_address: '<span class="locality">Madrid</span>',
    });
  });

  it('formatted_address: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['formatted_address'])).toEqual({
      formatted_address: 'Madrid, Spain',
    });
  });

  it('geometry: location and viewport, same instances', () => {
    const out = toLegacyPlaceResult(place(fullData()), ['geometry']);
    expect(Object.keys(out)).toEqual(['geometry']);
    expect(out.geometry?.location).toBe(LOCATION);
    expect(out.geometry?.viewport).toBe(VIEWPORT);
  });

  it('geometry.location: only location', () => {
    const out = toLegacyPlaceResult(place(fullData()), ['geometry.location']);
    expect(Object.keys(out.geometry ?? {})).toEqual(['location']);
    expect(out.geometry?.location).toBe(LOCATION);
  });

  it('geometry.viewport: only viewport', () => {
    const out = toLegacyPlaceResult(place(fullData()), ['geometry.viewport']);
    expect(Object.keys(out.geometry ?? {})).toEqual(['viewport']);
    expect(out.geometry?.viewport).toBe(VIEWPORT);
  });

  it('geometry.location and geometry.viewport merge into one object', () => {
    const out = toLegacyPlaceResult(place(fullData()), ['geometry.viewport', 'geometry.location']);
    expect(out.geometry).toEqual({ location: LOCATION, viewport: VIEWPORT });
  });

  it('geometry: a missing part is left out; nothing at all means no geometry key', () => {
    const noViewport = toLegacyPlaceResult(place({ location: LOCATION, viewport: null }), [
      'geometry',
    ]);
    expect(Object.keys(noViewport.geometry ?? {})).toEqual(['location']);
    expect(toLegacyPlaceResult(place({ viewport: VIEWPORT }), ['geometry.location'])).toEqual({});
  });

  it('plus_code: global and compound codes', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['plus_code'])).toEqual({
      plus_code: { global_code: '8CGRC78X+2G', compound_code: 'C78X+2G Madrid' },
    });
  });

  it('plus_code: a null compound code is left out, a null global code is ""', () => {
    const out = toLegacyPlaceResult(place({ plusCode: { globalCode: null, compoundCode: null } }), [
      'plus_code',
    ]);
    expect(out.plus_code).toEqual({ global_code: '' });
    expect('compound_code' in (out.plus_code ?? {})).toBe(false);
  });

  it('types: a copy', () => {
    const data = fullData();
    const out = toLegacyPlaceResult(place(data), ['types']);
    expect(out.types).toEqual(['locality', 'political']);
    expect(out.types).not.toBe(data.types);
  });

  it('place_id: from id', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['place_id'])).toEqual({ place_id: 'ChIJ_full' });
  });

  it('photos: size, html attributions and getUrl delegating to getURI', () => {
    const photo = new FakePhoto(300, 400, [
      new FakeAttribution('Ana', 'https://maps/ana'),
      new FakeAttribution('Bob', null),
    ]);
    const out = toLegacyPlaceResult(place({ photos: [photo] }), ['photos']);
    const legacy = out.photos?.[0];
    expect(legacy?.height).toBe(300);
    expect(legacy?.width).toBe(400);
    expect(legacy?.html_attributions).toEqual(['<a href="https://maps/ana">Ana</a>', 'Bob']);
    expect(legacy?.getUrl({ maxWidth: 100 })).toBe('https://photo/100x');
    expect(photo.getURI).toHaveBeenLastCalledWith({ maxWidth: 100 });
    expect(legacy?.getUrl()).toBe('https://photo/default');
    expect(photo.getURI).toHaveBeenLastCalledWith(undefined);
  });

  it('photos: attribution text and uri are HTML-escaped', () => {
    const photo = new FakePhoto(1, 1, [new FakeAttribution('A & <B>', 'https://x/?a=1&b="2"')]);
    const out = toLegacyPlaceResult(place({ photos: [photo] }), ['photos']);
    expect(out.photos?.[0]?.html_attributions).toEqual([
      '<a href="https://x/?a=1&amp;b=&quot;2&quot;">A &amp; &lt;B&gt;</a>',
    ]);
  });

  it('name: from displayName', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['name'])).toEqual({ name: 'Madrid' });
  });

  it('business_status: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['business_status'])).toEqual({
      business_status: 'OPERATIONAL',
    });
  });

  it('utc_offset_minutes: as is, 0 included', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['utc_offset_minutes'])).toEqual({
      utc_offset_minutes: 60,
    });
    expect(toLegacyPlaceResult(place({ utcOffsetMinutes: 0 }), ['utc_offset_minutes'])).toEqual({
      utc_offset_minutes: 0,
    });
  });

  it('icon_background_color: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['icon_background_color'])).toEqual({
      icon_background_color: '#7B9EB0',
    });
  });

  it('icon_mask_base_uri: from svgIconMaskURI', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['icon_mask_base_uri'])).toEqual({
      icon_mask_base_uri: 'https://maps/icon',
    });
  });

  it('opening_hours: periods with zero-padded time, weekday_text, isOpen() undefined', () => {
    const out = toLegacyPlaceResult(place(fullData()), ['opening_hours']);
    const hours = out.opening_hours;
    expect(hours?.periods).toEqual([
      {
        open: { day: 1, hours: 9, minutes: 5, time: '0905' },
        close: { day: 1, hours: 18, minutes: 30, time: '1830' },
      },
    ]);
    expect(hours?.weekday_text).toEqual(['Monday: 9:05 AM – 6:30 PM']);
    expect(hours?.isOpen()).toBeUndefined();
    expect(hours?.isOpen(new Date())).toBeUndefined();
    expect('open_now' in (hours ?? {})).toBe(false);
  });

  it('opening_hours: a null close stays null and a missing close stays undefined', () => {
    const out = toLegacyPlaceResult(
      place({
        regularOpeningHours: {
          periods: [{ open: point(0, 0, 0), close: null }, { open: point(2, 10, 0) }],
          weekdayDescriptions: [],
        },
      }),
      ['opening_hours'],
    );
    const periods = out.opening_hours?.periods ?? [];
    expect(periods[0]?.open).toEqual({ day: 0, hours: 0, minutes: 0, time: '0000' });
    expect(periods[0]?.close).toBeNull();
    expect(periods[1]?.close).toBeUndefined();
  });

  it('opening_hours: weekday_text is a copy', () => {
    const data = fullData();
    const out = toLegacyPlaceResult(place(data), ['opening_hours']);
    const source = (data.regularOpeningHours as { weekdayDescriptions: string[] })
      .weekdayDescriptions;
    expect(out.opening_hours?.weekday_text).not.toBe(source);
  });

  it.each([
    ['FREE', 0],
    ['INEXPENSIVE', 1],
    ['MODERATE', 2],
    ['EXPENSIVE', 3],
    ['VERY_EXPENSIVE', 4],
  ])('price_level: %s is %i', (level, value) => {
    expect(toLegacyPlaceResult(place({ priceLevel: level }), ['price_level'])).toEqual({
      price_level: value,
    });
  });

  it('price_level: null, unknown or prototype names are not emitted', () => {
    for (const priceLevel of [null, undefined, '', 'PRICE_LEVEL_UNSPECIFIED', 'toString']) {
      expect(toLegacyPlaceResult(place({ priceLevel }), ['price_level'])).toEqual({});
    }
  });

  it('rating: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['rating'])).toEqual({ rating: 4.5 });
  });

  it('user_ratings_total: from userRatingCount', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['user_ratings_total'])).toEqual({
      user_ratings_total: 120,
    });
  });

  it('website: from websiteURI', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['website'])).toEqual({
      website: 'https://madrid.es',
    });
  });

  it('international_phone_number: as is', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['international_phone_number'])).toEqual({
      international_phone_number: '+34 910 00 00 00',
    });
  });

  it('formatted_phone_number: from nationalPhoneNumber', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['formatted_phone_number'])).toEqual({
      formatted_phone_number: '910 00 00 00',
    });
  });

  it('reviews: every field is mapped, with time in whole seconds', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['reviews'])).toEqual({
      reviews: [
        {
          author_name: 'Luis',
          author_url: 'https://maps/luis',
          profile_photo_url: 'https://maps/luis.jpg',
          language: 'en',
          rating: 5,
          relative_time_description: 'a week ago',
          text: 'Great',
          time: 1700000000,
        },
      ],
    });
  });

  it('reviews: a missing author or text falls back to empty strings', () => {
    const out = toLegacyPlaceResult(
      place({
        reviews: [
          {
            authorAttribution: null,
            rating: null,
            relativePublishTimeDescription: null,
            text: null,
            textLanguageCode: null,
            publishTime: null,
          },
          {
            authorAttribution: new FakeAttribution('Eva', null, null),
            rating: 3,
            relativePublishTimeDescription: null,
            text: null,
            textLanguageCode: null,
            publishTime: null,
          },
        ],
      }),
      ['reviews'],
    );
    const [first, second] = out.reviews ?? [];
    expect(first).toEqual({
      author_name: '',
      author_url: undefined,
      profile_photo_url: '',
      language: '',
      rating: null,
      relative_time_description: '',
      text: '',
      time: 0,
    });
    expect(second?.author_name).toBe('Eva');
    expect(second?.author_url).toBeNull();
    expect(second?.profile_photo_url).toBe('');
  });

  it('url: from googleMapsURI', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['url'])).toEqual({
      url: 'https://maps.google.com/?cid=1',
    });
  });

  it('vicinity: from shortFormattedAddress', () => {
    expect(toLegacyPlaceResult(place(fullData()), ['vicinity'])).toEqual({ vicinity: 'Madrid' });
  });

  it('html_attributions: link when providerURI exists, provider alone otherwise', () => {
    const out = toLegacyPlaceResult(
      place({
        attributions: [
          { provider: 'Acme', providerURI: 'https://acme' },
          { provider: 'Plain', providerURI: null },
          { provider: null, providerURI: null },
        ],
      }),
      ['html_attributions'],
    );
    expect(out.html_attributions).toEqual(['<a href="https://acme">Acme</a>', 'Plain', '']);
  });
});

describe('toLegacyPlaceResult: output shape', () => {
  it('is plain and JSON-serialisable apart from geometry instances and functions', () => {
    const out = toLegacyPlaceResult(place(fullData()));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    const json = JSON.parse(JSON.stringify(out));
    expect(json.name).toBe('Madrid');
    expect(json.photos[0]).toEqual({
      height: 600,
      html_attributions: ['<a href="https://maps/ana">Ana</a>'],
      width: 800,
    });
    expect(json.opening_hours.isOpen).toBeUndefined();
    for (const key of Object.keys(out)) {
      expect(Object.getOwnPropertyDescriptor(out, key)?.get).toBeUndefined();
    }
  });
});
