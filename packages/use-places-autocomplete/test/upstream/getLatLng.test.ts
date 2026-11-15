// Ported from use-places-autocomplete 4.0.1, src/__tests__/getLatLng.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { describe, expect, it } from 'vitest';
import type { GeocodeResult } from '../../src/types';
import { getLatLng } from '../../src/utils';

describe('getLatLng', () => {
  it('should handle success correctly', () => {
    const latLng = { lat: 123, lng: 456 };
    const result = getLatLng({
      geometry: {
        location: {
          lat: (): number => latLng.lat,
          lng: (): number => latLng.lng,
        },
      },
    } as unknown as GeocodeResult);
    expect(result).toEqual(latLng);
  });
});
