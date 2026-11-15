// Ported from use-places-autocomplete 4.0.1, src/__tests__/getDetails.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { createFakeGoogle, type FakeControl, fakeMapsError } from '@places-compat/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDetailsErr } from '../../src/messages';
import type { GetDetailsArgs } from '../../src/types';
import { getDetails } from '../../src/utils';

type Scope = { google?: unknown };

const scope = globalThis as Scope;
const hadGoogle = Object.getOwnPropertyDescriptor(scope, 'google') !== undefined;
const originalGoogle = scope.google;

const data = { name: 'abc', rating: 4.5 };
const place = { id: '0109', displayName: 'abc', formattedAddress: '123', rating: 4.5 };
const error = 'NOT_FOUND';
const request = { placeId: '0109', fields: ['name', 'rating'] };

const setupMaps = (type = 'success'): FakeControl => {
  const fake = createFakeGoogle();
  fake.control.onFetchFields(
    request.placeId,
    type === 'success' ? place : fakeMapsError(error, 'PLACES_GET_PLACE'),
  );
  scope.google = fake.google;
  return fake.control;
};

describe('getDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (hadGoogle) scope.google = originalGoogle;
    else delete scope.google;
  });

  it('should make call with request passed in', async () => {
    const control = setupMaps('request');
    await getDetails(request).catch(() => null);
    expect(control.calls.filter(({ kind }) => kind === 'fetchFields')).toEqual([
      expect.objectContaining({
        request: { placeId: request.placeId, fields: ['displayName', 'rating'] },
      }),
    ]);
  });

  it('should handle success correctly', () => {
    setupMaps();
    return getDetails(request).then((results) => expect(results).toEqual(data));
  });

  it('should throw error when place_id is not provided', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    setupMaps();
    let err: unknown;
    try {
      await getDetails({} as GetDetailsArgs);
    } catch (someErr) {
      err = someErr;
    }
    expect(consoleError).toHaveBeenCalledWith(getDetailsErr);
    expect(err).toBe(getDetailsErr);
  });

  it('should handle failure correctly', async () => {
    setupMaps('failure');
    let err: unknown;
    try {
      await getDetails(request);
    } catch (someErr) {
      err = someErr;
    }
    expect(err).toBe(error);
  });
});
