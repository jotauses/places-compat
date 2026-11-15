import { expectTypeOf } from 'expect-type';
import type ReactGoogleAutocomplete from '../../../src';
import type { usePlacesWidget } from '../../../src';
import type usePlacesAutocompleteService from '../../../src/usePlacesAutocompleteService';

type ComponentReturn = ReturnType<typeof ReactGoogleAutocomplete>;
type ComponentProps = Parameters<typeof ReactGoogleAutocomplete>[0];
type WidgetReturn = ReturnType<typeof usePlacesWidget<HTMLInputElement>>;
type ServiceReturn = ReturnType<typeof usePlacesAutocompleteService>;

expectTypeOf<ComponentReturn>().not.toBeAny();
expectTypeOf<ComponentProps>().not.toBeAny();

expectTypeOf<WidgetReturn>().not.toBeAny();
expectTypeOf<WidgetReturn['ref']>().not.toBeAny();
expectTypeOf<WidgetReturn['ref']['current']>().not.toBeAny();
expectTypeOf<WidgetReturn['autocompleteRef']>().not.toBeAny();
expectTypeOf<WidgetReturn['autocompleteRef']['current']>().not.toBeAny();

expectTypeOf<ServiceReturn>().not.toBeAny();
expectTypeOf<ServiceReturn['placesService']>().not.toBeAny();
expectTypeOf<ServiceReturn['autocompleteSessionToken']>().not.toBeAny();
expectTypeOf<ServiceReturn['placesAutocompleteService']>().not.toBeAny();
expectTypeOf<ServiceReturn['placePredictions']>().not.toBeAny();
expectTypeOf<ServiceReturn['placePredictions'][number]>().not.toBeAny();
expectTypeOf<ServiceReturn['isPlacePredictionsLoading']>().not.toBeAny();
expectTypeOf<ServiceReturn['getPlacePredictions']>().not.toBeAny();
expectTypeOf<ServiceReturn['queryPredictions']>().not.toBeAny();
expectTypeOf<ServiceReturn['queryPredictions'][number]>().not.toBeAny();
expectTypeOf<ServiceReturn['isQueryPredictionsLoading']>().not.toBeAny();
expectTypeOf<ServiceReturn['getQueryPredictions']>().not.toBeAny();
expectTypeOf<ServiceReturn['refreshSessionToken']>().not.toBeAny();
