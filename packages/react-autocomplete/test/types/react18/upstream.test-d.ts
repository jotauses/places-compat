import { expectTypeOf } from 'expect-type';
import UpstreamComponent, {
  type ReactGoogleAutocompleteInputProps as UpstreamInputProps,
  type ReactGoogleAutocompleteProps as UpstreamProps,
  usePlacesWidget as upstreamUsePlacesWidget,
} from 'upstream-rga';
import upstreamUsePlacesAutocompleteService from 'upstream-rga/lib/usePlacesAutocompleteService';
import ReactGoogleAutocomplete, {
  type ReactGoogleAutocompleteInputProps,
  type ReactGoogleAutocompleteProps,
  usePlacesWidget,
} from '../../../src';
import usePlacesAutocompleteService from '../../../src/usePlacesAutocompleteService';

expectTypeOf<typeof UpstreamComponent>().not.toBeAny();
expectTypeOf<UpstreamInputProps>().not.toBeAny();
expectTypeOf<ReturnType<typeof UpstreamComponent>>().not.toBeAny();

expectTypeOf(ReactGoogleAutocomplete).toEqualTypeOf(UpstreamComponent);
expectTypeOf(UpstreamComponent).toEqualTypeOf(ReactGoogleAutocomplete);
expectTypeOf<ReturnType<typeof ReactGoogleAutocomplete>>().toEqualTypeOf<JSX.Element>();
expectTypeOf<JSX.Element>().toEqualTypeOf<ReturnType<typeof ReactGoogleAutocomplete>>();

expectTypeOf(usePlacesWidget).toEqualTypeOf(upstreamUsePlacesWidget);
expectTypeOf(upstreamUsePlacesWidget).toEqualTypeOf(usePlacesWidget);

expectTypeOf<ReactGoogleAutocompleteProps>().toEqualTypeOf<UpstreamProps>();
expectTypeOf<UpstreamProps>().toEqualTypeOf<ReactGoogleAutocompleteProps>();

expectTypeOf<ReactGoogleAutocompleteInputProps>().toEqualTypeOf<UpstreamInputProps>();
expectTypeOf<UpstreamInputProps>().toEqualTypeOf<ReactGoogleAutocompleteInputProps>();

expectTypeOf(usePlacesAutocompleteService).toEqualTypeOf(upstreamUsePlacesAutocompleteService);
expectTypeOf(upstreamUsePlacesAutocompleteService).toEqualTypeOf(usePlacesAutocompleteService);
