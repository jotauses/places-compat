import { describe, expect, it } from 'vitest';
import { toLegacyPrediction } from '../src/prediction';

interface RangeInit {
  startOffset?: number;
  endOffset: number;
}

interface TextInit {
  text: string;
  matches?: RangeInit[];
}

interface PredictionInit {
  placeId?: string;
  text: TextInit;
  mainText?: TextInit | null;
  secondaryText?: TextInit | null;
  types?: string[];
  distanceMeters?: number | null;
}

class FakeRange {
  readonly #init: RangeInit;
  constructor(init: RangeInit) {
    this.#init = init;
  }
  get startOffset(): number | undefined {
    return this.#init.startOffset;
  }
  get endOffset(): number {
    return this.#init.endOffset;
  }
}

class FakeText {
  readonly #init: TextInit;
  constructor(init: TextInit) {
    this.#init = init;
  }
  get text(): string {
    return this.#init.text;
  }
  get matches(): FakeRange[] {
    return (this.#init.matches ?? []).map((m) => new FakeRange(m));
  }
  toString(): string {
    return this.#init.text;
  }
}

class FakePrediction {
  readonly #init: PredictionInit;
  constructor(init: PredictionInit) {
    this.#init = init;
  }
  get placeId(): string {
    return this.#init.placeId ?? 'ChIJ_test';
  }
  get text(): FakeText {
    return new FakeText(this.#init.text);
  }
  get mainText(): FakeText | null {
    const main = this.#init.mainText;
    return main ? new FakeText(main) : null;
  }
  get secondaryText(): FakeText | null {
    const secondary = this.#init.secondaryText;
    return secondary ? new FakeText(secondary) : null;
  }
  get types(): string[] {
    return this.#init.types ?? [];
  }
  get distanceMeters(): number | null {
    return this.#init.distanceMeters ?? null;
  }
  toPlace(): never {
    throw new Error('not used');
  }
}

const prediction = (init: PredictionInit) =>
  new FakePrediction(init) as unknown as google.maps.places.PlacePrediction;

const MADRID: PredictionInit = {
  placeId: 'ChIJgTwKgJcpQg0RaSKMYcHeNsQ',
  text: { text: 'Madrid, Spain', matches: [{ startOffset: 0, endOffset: 3 }] },
  mainText: { text: 'Madrid', matches: [{ startOffset: 0, endOffset: 3 }] },
  secondaryText: { text: 'Spain' },
  types: ['locality', 'political', 'geocode'],
  distanceMeters: null,
};

describe('toLegacyPrediction: field by field', () => {
  it('converts a full prediction', () => {
    expect(toLegacyPrediction(prediction(MADRID))).toEqual({
      description: 'Madrid, Spain',
      matched_substrings: [{ length: 3, offset: 0 }],
      place_id: 'ChIJgTwKgJcpQg0RaSKMYcHeNsQ',
      structured_formatting: {
        main_text: 'Madrid',
        main_text_matched_substrings: [{ length: 3, offset: 0 }],
        secondary_text: 'Spain',
      },
      terms: [
        { offset: 0, value: 'Madrid' },
        { offset: 8, value: 'Spain' },
      ],
      types: ['locality', 'political', 'geocode'],
    });
  });

  it('description: is text.text', () => {
    expect(toLegacyPrediction(prediction(MADRID)).description).toBe('Madrid, Spain');
  });

  it('place_id: is placeId', () => {
    expect(toLegacyPrediction(prediction(MADRID)).place_id).toBe('ChIJgTwKgJcpQg0RaSKMYcHeNsQ');
  });

  it('matched_substrings: each range becomes offset and length', () => {
    const p = prediction({
      ...MADRID,
      text: {
        text: 'Calle Mayor, Madrid',
        matches: [
          { startOffset: 0, endOffset: 5 },
          { startOffset: 6, endOffset: 11 },
        ],
      },
    });
    expect(toLegacyPrediction(p).matched_substrings).toEqual([
      { length: 5, offset: 0 },
      { length: 5, offset: 6 },
    ]);
  });

  it('matched_substrings: an undefined startOffset counts as 0', () => {
    const p = prediction({
      ...MADRID,
      text: { text: 'Madrid, Spain', matches: [{ endOffset: 4 }] },
    });
    expect(toLegacyPrediction(p).matched_substrings).toEqual([{ length: 4, offset: 0 }]);
  });

  it('matched_substrings: falls back to mainText matches (CORE-08)', () => {
    const p = prediction({ ...MADRID, text: { text: 'Madrid, Spain', matches: [] } });
    const out = toLegacyPrediction(p);
    expect(out.matched_substrings).toEqual([{ length: 3, offset: 0 }]);
    expect(out.matched_substrings).not.toBe(out.structured_formatting.main_text_matched_substrings);
  });

  it('matched_substrings: no fallback when description does not start with mainText', () => {
    const p = prediction({
      ...MADRID,
      text: { text: 'Spain, Madrid', matches: [] },
      mainText: { text: 'Madrid', matches: [{ startOffset: 0, endOffset: 3 }] },
    });
    expect(toLegacyPrediction(p).matched_substrings).toEqual([]);
  });

  it('matched_substrings: empty when both lists are empty', () => {
    const p = prediction({
      ...MADRID,
      text: { text: 'Madrid, Spain' },
      mainText: { text: 'Madrid' },
    });
    const out = toLegacyPrediction(p);
    expect(out.matched_substrings).toEqual([]);
    expect(out.structured_formatting.main_text_matched_substrings).toEqual([]);
  });

  it('matched_substrings: treats missing matches arrays as empty', () => {
    const p = {
      placeId: 'x',
      text: { text: 'Madrid', matches: undefined },
      mainText: { text: 'Madrid', matches: null },
      secondaryText: null,
      types: undefined,
      distanceMeters: undefined,
    } as unknown as google.maps.places.PlacePrediction;
    const out = toLegacyPrediction(p);
    expect(out.matched_substrings).toEqual([]);
    expect(out.structured_formatting.main_text_matched_substrings).toEqual([]);
    expect(out.types).toEqual([]);
    expect('distance_meters' in out).toBe(false);
  });

  it('main_text: falls back to text.text when mainText is null', () => {
    const p = prediction({ ...MADRID, mainText: null });
    const out = toLegacyPrediction(p);
    expect(out.structured_formatting.main_text).toBe('Madrid, Spain');
    expect(out.structured_formatting.main_text_matched_substrings).toEqual([]);
    expect(out.matched_substrings).toEqual([{ length: 3, offset: 0 }]);
  });

  it('main_text_matched_substrings: converted with startOffset ?? 0', () => {
    const p = prediction({
      ...MADRID,
      mainText: { text: 'Madrid', matches: [{ endOffset: 2 }, { startOffset: 3, endOffset: 5 }] },
    });
    expect(toLegacyPrediction(p).structured_formatting.main_text_matched_substrings).toEqual([
      { length: 2, offset: 0 },
      { length: 2, offset: 3 },
    ]);
  });

  it("secondary_text: '' when secondaryText is null (CORE-05)", () => {
    const p = prediction({ ...MADRID, secondaryText: null });
    expect(toLegacyPrediction(p).structured_formatting.secondary_text).toBe('');
  });

  it('terms: synthesized from the description (CORE-01)', () => {
    const p = prediction({ ...MADRID, text: { text: 'Gran Vía 1, Madrid, Spain' } });
    expect(toLegacyPrediction(p).terms).toEqual([
      { offset: 0, value: 'Gran Vía 1' },
      { offset: 12, value: 'Madrid' },
      { offset: 20, value: 'Spain' },
    ]);
  });

  it('types: a copy of the array (CORE-06)', () => {
    const types = ['route', 'geocode'];
    const p = { ...MADRID, types };
    const fake = new FakePrediction(p);
    const out = toLegacyPrediction(fake as unknown as google.maps.places.PlacePrediction);
    expect(out.types).toEqual(types);
    expect(out.types).not.toBe(types);
    out.types.push('x');
    expect(types).toEqual(['route', 'geocode']);
  });

  it('distance_meters: emitted when not null, 0 included', () => {
    expect(
      toLegacyPrediction(prediction({ ...MADRID, distanceMeters: 1234 })).distance_meters,
    ).toBe(1234);
    const zero = toLegacyPrediction(prediction({ ...MADRID, distanceMeters: 0 }));
    expect(zero.distance_meters).toBe(0);
    expect('distance_meters' in zero).toBe(true);
  });

  it('distance_meters: key absent when null', () => {
    const out = toLegacyPrediction(prediction({ ...MADRID, distanceMeters: null }));
    expect('distance_meters' in out).toBe(false);
  });

  it('id, reference: never emitted', () => {
    const out = toLegacyPrediction(prediction(MADRID)) as unknown as Record<string, unknown>;
    expect('id' in out).toBe(false);
    expect('reference' in out).toBe(false);
  });

  it('keeps keys in the legacy JSON order', () => {
    const out = toLegacyPrediction(prediction({ ...MADRID, distanceMeters: 5 }));
    expect(Object.keys(out)).toEqual([
      'description',
      'distance_meters',
      'matched_substrings',
      'place_id',
      'structured_formatting',
      'terms',
      'types',
    ]);
  });

  it('handles non-BMP text with UTF-16 offsets', () => {
    const p = prediction({
      text: { text: '😀 Café, Madrid', matches: [{ startOffset: 0, endOffset: 2 }] },
      mainText: { text: '😀 Café', matches: [{ startOffset: 3, endOffset: 7 }] },
      secondaryText: { text: 'Madrid' },
    });
    const out = toLegacyPrediction(p);
    expect(out.matched_substrings).toEqual([{ length: 2, offset: 0 }]);
    expect(out.structured_formatting.main_text).toBe('😀 Café');
    expect(out.terms).toEqual([
      { offset: 0, value: '😀 Café' },
      { offset: 9, value: 'Madrid' },
    ]);
  });

  it('returns a plain JSON-serialisable object', () => {
    const out = toLegacyPrediction(prediction({ ...MADRID, distanceMeters: 7 }));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(out.structured_formatting)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    for (const key of Object.keys(out)) {
      expect(Object.getOwnPropertyDescriptor(out, key)?.get).toBeUndefined();
    }
  });
});
