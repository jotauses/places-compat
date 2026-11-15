/// <reference types="upstream-upa" />
import { expectTypeOf } from 'expect-type';
import type * as Theirs from 'use-places-autocomplete';
import type theirDefault from 'use-places-autocomplete';
import type {
  getDetails as theirGetDetails,
  getGeocode as theirGetGeocode,
  getLatLng as theirGetLatLng,
  getZipCode as theirGetZipCode,
} from 'use-places-autocomplete';
import type * as Ours from '../../src';
import usePlacesAutocomplete, { getDetails, getGeocode, getLatLng, getZipCode } from '../../src';

type IgnoringReadonlyBindings<T> = Readonly<T>;

expectTypeOf<Ours.RequestOptions>().toEqualTypeOf<Theirs.RequestOptions>();
expectTypeOf<Theirs.RequestOptions>().toEqualTypeOf<Ours.RequestOptions>();
expectTypeOf<Ours.HookArgs>().toEqualTypeOf<Theirs.HookArgs>();
expectTypeOf<Theirs.HookArgs>().toEqualTypeOf<Ours.HookArgs>();
expectTypeOf<Ours.Suggestion>().toEqualTypeOf<Theirs.Suggestion>();
expectTypeOf<Theirs.Suggestion>().toEqualTypeOf<Ours.Suggestion>();
expectTypeOf<Ours.Status>().toEqualTypeOf<Theirs.Status>();
expectTypeOf<Theirs.Status>().toEqualTypeOf<Ours.Status>();
expectTypeOf<Ours.Suggestions>().toEqualTypeOf<Theirs.Suggestions>();
expectTypeOf<Theirs.Suggestions>().toEqualTypeOf<Ours.Suggestions>();
expectTypeOf<Ours.SetValue>().toEqualTypeOf<Theirs.SetValue>();
expectTypeOf<Theirs.SetValue>().toEqualTypeOf<Ours.SetValue>();
expectTypeOf<Ours.ClearSuggestions>().toEqualTypeOf<Theirs.ClearSuggestions>();
expectTypeOf<Theirs.ClearSuggestions>().toEqualTypeOf<Ours.ClearSuggestions>();
expectTypeOf<Ours.ClearCache>().toEqualTypeOf<Theirs.ClearCache>();
expectTypeOf<Theirs.ClearCache>().toEqualTypeOf<Ours.ClearCache>();
expectTypeOf<Ours.Init>().toEqualTypeOf<Theirs.Init>();
expectTypeOf<Theirs.Init>().toEqualTypeOf<Ours.Init>();
expectTypeOf<Ours.HookReturn>().toEqualTypeOf<Theirs.HookReturn>();
expectTypeOf<Theirs.HookReturn>().toEqualTypeOf<Ours.HookReturn>();
expectTypeOf<Ours.GeoArgs>().toEqualTypeOf<Theirs.GeoArgs>();
expectTypeOf<Theirs.GeoArgs>().toEqualTypeOf<Ours.GeoArgs>();
expectTypeOf<Ours.GeocodeResult>().toEqualTypeOf<Theirs.GeocodeResult>();
expectTypeOf<Theirs.GeocodeResult>().toEqualTypeOf<Ours.GeocodeResult>();
expectTypeOf<Ours.GeoReturn>().toEqualTypeOf<Theirs.GeoReturn>();
expectTypeOf<Theirs.GeoReturn>().toEqualTypeOf<Ours.GeoReturn>();
expectTypeOf<Ours.LatLng>().toEqualTypeOf<Theirs.LatLng>();
expectTypeOf<Theirs.LatLng>().toEqualTypeOf<Ours.LatLng>();
expectTypeOf<Ours.ZipCode>().toEqualTypeOf<Theirs.ZipCode>();
expectTypeOf<Theirs.ZipCode>().toEqualTypeOf<Ours.ZipCode>();
expectTypeOf<Ours.GetDetailsArgs>().toEqualTypeOf<Theirs.GetDetailsArgs>();
expectTypeOf<Theirs.GetDetailsArgs>().toEqualTypeOf<Ours.GetDetailsArgs>();
expectTypeOf<Ours.DetailsResult>().toEqualTypeOf<Theirs.DetailsResult>();
expectTypeOf<Theirs.DetailsResult>().toEqualTypeOf<Ours.DetailsResult>();

interface OurTypeExports {
  RequestOptions: Ours.RequestOptions;
  HookArgs: Ours.HookArgs;
  Suggestion: Ours.Suggestion;
  Status: Ours.Status;
  Suggestions: Ours.Suggestions;
  SetValue: Ours.SetValue;
  ClearSuggestions: Ours.ClearSuggestions;
  ClearCache: Ours.ClearCache;
  Init: Ours.Init;
  HookReturn: Ours.HookReturn;
  GeoArgs: Ours.GeoArgs;
  GeocodeResult: Ours.GeocodeResult;
  GeoReturn: Ours.GeoReturn;
  LatLng: Ours.LatLng;
  ZipCode: Ours.ZipCode;
  GetDetailsArgs: Ours.GetDetailsArgs;
  DetailsResult: Ours.DetailsResult;
}

interface TheirTypeExports {
  RequestOptions: Theirs.RequestOptions;
  HookArgs: Theirs.HookArgs;
  Suggestion: Theirs.Suggestion;
  Status: Theirs.Status;
  Suggestions: Theirs.Suggestions;
  SetValue: Theirs.SetValue;
  ClearSuggestions: Theirs.ClearSuggestions;
  ClearCache: Theirs.ClearCache;
  Init: Theirs.Init;
  HookReturn: Theirs.HookReturn;
  GeoArgs: Theirs.GeoArgs;
  GeocodeResult: Theirs.GeocodeResult;
  GeoReturn: Theirs.GeoReturn;
  LatLng: Theirs.LatLng;
  ZipCode: Theirs.ZipCode;
  GetDetailsArgs: Theirs.GetDetailsArgs;
  DetailsResult: Theirs.DetailsResult;
}

expectTypeOf<keyof OurTypeExports>().toEqualTypeOf<
  | 'RequestOptions'
  | 'HookArgs'
  | 'Suggestion'
  | 'Status'
  | 'Suggestions'
  | 'SetValue'
  | 'ClearSuggestions'
  | 'ClearCache'
  | 'Init'
  | 'HookReturn'
  | 'GeoArgs'
  | 'GeocodeResult'
  | 'GeoReturn'
  | 'LatLng'
  | 'ZipCode'
  | 'GetDetailsArgs'
  | 'DetailsResult'
>();
expectTypeOf<OurTypeExports>().toEqualTypeOf<TheirTypeExports>();

expectTypeOf<keyof typeof Ours>().toEqualTypeOf<keyof typeof Theirs>();
expectTypeOf<keyof typeof Ours>().toEqualTypeOf<
  'default' | 'getGeocode' | 'getLatLng' | 'getZipCode' | 'getDetails'
>();
expectTypeOf<IgnoringReadonlyBindings<typeof Ours>>().toEqualTypeOf<
  IgnoringReadonlyBindings<typeof Theirs>
>();

expectTypeOf(usePlacesAutocomplete).toEqualTypeOf<typeof theirDefault>();
expectTypeOf(getGeocode).toEqualTypeOf<typeof theirGetGeocode>();
expectTypeOf(getLatLng).toEqualTypeOf<typeof theirGetLatLng>();
expectTypeOf(getZipCode).toEqualTypeOf<typeof theirGetZipCode>();
expectTypeOf(getDetails).toEqualTypeOf<typeof theirGetDetails>();

expectTypeOf(usePlacesAutocomplete).parameters.toEqualTypeOf<
  [args?: Theirs.HookArgs | undefined]
>();
expectTypeOf(usePlacesAutocomplete).parameter(0).toEqualTypeOf<Theirs.HookArgs | undefined>();
expectTypeOf(usePlacesAutocomplete).returns.toEqualTypeOf<Theirs.HookReturn>();
expectTypeOf(usePlacesAutocomplete).toBeCallableWith({});

expectTypeOf(getGeocode).parameters.toEqualTypeOf<[args: google.maps.GeocoderRequest]>();
expectTypeOf(getGeocode).returns.toEqualTypeOf<Promise<google.maps.GeocoderResult[]>>();
expectTypeOf<Ours.GeoReturn>().toEqualTypeOf<Promise<Ours.GeocodeResult[]>>();

expectTypeOf(getLatLng).parameters.toEqualTypeOf<[result: google.maps.GeocoderResult]>();
expectTypeOf(getLatLng).returns.toEqualTypeOf<{ lat: number; lng: number }>();

expectTypeOf(getZipCode).parameters.toEqualTypeOf<
  [result: google.maps.GeocoderResult, useShortName: boolean]
>();
expectTypeOf(getZipCode).parameter(1).toEqualTypeOf<boolean>();
expectTypeOf(getZipCode).returns.toEqualTypeOf<string | undefined>();
expectTypeOf<Parameters<typeof getZipCode>['length']>().toEqualTypeOf<2>();

expectTypeOf(getDetails).parameters.toEqualTypeOf<[args: google.maps.places.PlaceDetailsRequest]>();
expectTypeOf(getDetails).returns.toEqualTypeOf<Promise<google.maps.places.PlaceResult | string>>();
expectTypeOf<Ours.DetailsResult>().toEqualTypeOf<
  Promise<google.maps.places.PlaceResult | string>
>();

expectTypeOf<Ours.HookReturn['setValue']>().toBeCallableWith('Paris');
expectTypeOf<Ours.HookReturn['setValue']>().toBeCallableWith('Paris', false);
expectTypeOf<Ours.ClearCache>().parameters.toEqualTypeOf<[key?: string | undefined]>();
expectTypeOf<Ours.SetValue>().parameters.toEqualTypeOf<
  [val: string, shouldFetchData?: boolean | undefined]
>();
expectTypeOf<Ours.HookReturn['clearCache']>().toBeCallableWith('upa');
expectTypeOf<Ours.Suggestions['status']>().toEqualTypeOf<
  `${google.maps.places.PlacesServiceStatus}` | ''
>();
expectTypeOf<Ours.HookArgs['cache']>().toEqualTypeOf<number | false | undefined>();

declare const result: Ours.GeocodeResult;

// @ts-expect-error useShortName is required
getZipCode(result);

// @ts-expect-error getLatLng takes a geocoder result
getLatLng({ lat: 1, lng: 2 });

// @ts-expect-error the hook argument is an object
expectTypeOf(usePlacesAutocomplete).toBeCallableWith('upa');

// @ts-expect-error ZipCode includes undefined
expectTypeOf<Ours.ZipCode>().toEqualTypeOf<string>();

// @ts-expect-error Status is a closed union
expectTypeOf<Ours.Status>().toEqualTypeOf<string>();

// @ts-expect-error getDetails can also resolve to a string
expectTypeOf(getDetails).returns.toEqualTypeOf<Promise<google.maps.places.PlaceResult>>();
