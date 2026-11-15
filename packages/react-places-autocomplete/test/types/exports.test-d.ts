import { expectTypeOf } from 'expect-type';
import type * as Original from 'react-places-autocomplete';
import type OriginalPlacesAutocomplete from 'react-places-autocomplete';
import type * as Ours from '../../src';
import type { AutocompletePrediction, PropTypes, Suggestion } from '../../src';
import PlacesAutocomplete, { geocodeByAddress, geocodeByPlaceId, getLatLng } from '../../src';

expectTypeOf<keyof typeof Ours>().toEqualTypeOf<keyof typeof Original>();
expectTypeOf<keyof typeof Original>().toEqualTypeOf<keyof typeof Ours>();
expectTypeOf<keyof typeof Ours>().toEqualTypeOf<
  'default' | 'geocodeByAddress' | 'geocodeByPlaceId' | 'getLatLng'
>();

expectTypeOf(PlacesAutocomplete).toEqualTypeOf<typeof OriginalPlacesAutocomplete>();
expectTypeOf<typeof OriginalPlacesAutocomplete>().toEqualTypeOf(PlacesAutocomplete);
expectTypeOf<PlacesAutocomplete>().toEqualTypeOf<OriginalPlacesAutocomplete>();
expectTypeOf<OriginalPlacesAutocomplete>().toEqualTypeOf<PlacesAutocomplete>();
expectTypeOf<ConstructorParameters<typeof PlacesAutocomplete>>().toEqualTypeOf<
  ConstructorParameters<typeof OriginalPlacesAutocomplete>
>();
expectTypeOf<InstanceType<typeof PlacesAutocomplete>>().toEqualTypeOf<
  InstanceType<typeof OriginalPlacesAutocomplete>
>();

expectTypeOf<PropTypes>().toEqualTypeOf<Original.PropTypes>();
expectTypeOf<Original.PropTypes>().toEqualTypeOf<PropTypes>();
expectTypeOf<Suggestion>().toEqualTypeOf<Original.Suggestion>();
expectTypeOf<Original.Suggestion>().toEqualTypeOf<Suggestion>();
expectTypeOf<AutocompletePrediction>().toEqualTypeOf<Original.AutocompletePrediction>();
expectTypeOf<Original.AutocompletePrediction>().toEqualTypeOf<AutocompletePrediction>();

expectTypeOf(geocodeByAddress).toEqualTypeOf<typeof Original.geocodeByAddress>();
expectTypeOf<typeof Original.geocodeByAddress>().toEqualTypeOf(geocodeByAddress);
expectTypeOf(geocodeByAddress).parameters.toEqualTypeOf<
  Parameters<typeof Original.geocodeByAddress>
>();
expectTypeOf(geocodeByAddress).returns.toEqualTypeOf<
  ReturnType<typeof Original.geocodeByAddress>
>();

expectTypeOf(geocodeByPlaceId).toEqualTypeOf<typeof Original.geocodeByPlaceId>();
expectTypeOf<typeof Original.geocodeByPlaceId>().toEqualTypeOf(geocodeByPlaceId);
expectTypeOf(geocodeByPlaceId).parameters.toEqualTypeOf<
  Parameters<typeof Original.geocodeByPlaceId>
>();
expectTypeOf(geocodeByPlaceId).returns.toEqualTypeOf<
  ReturnType<typeof Original.geocodeByPlaceId>
>();

expectTypeOf(getLatLng).toEqualTypeOf<typeof Original.getLatLng>();
expectTypeOf<typeof Original.getLatLng>().toEqualTypeOf(getLatLng);
expectTypeOf(getLatLng).parameters.toEqualTypeOf<Parameters<typeof Original.getLatLng>>();
expectTypeOf(getLatLng).returns.toEqualTypeOf<ReturnType<typeof Original.getLatLng>>();
