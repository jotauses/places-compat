// Ported from use-places-autocomplete 4.0.1, src/__tests__/getZipCode.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { describe, expect, it } from 'vitest';
import type { GeocodeResult, ZipCode } from '../../src/types';
import { getZipCode as getZipCodeStrict } from '../../src/utils';

const getZipCode = getZipCodeStrict as (result: GeocodeResult, useShortName?: boolean) => ZipCode;

const zipCode = {
  long_name: '12345',
  short_name: '123',
  types: ['postal_code'],
};

const result = (components: (typeof zipCode)[]) =>
  ({ address_components: components }) as unknown as GeocodeResult;

describe('getZipCode', () => {
  it('should handle success with long name correctly', () => {
    expect(getZipCode(result([zipCode]))).toEqual(zipCode.long_name);
  });

  it('should handle success with short name correctly', () => {
    expect(getZipCode(result([zipCode]), true)).toEqual(zipCode.short_name);
  });

  it('should handle success without result correctly', () => {
    expect(getZipCode(result([]))).toBeUndefined();
  });
});
