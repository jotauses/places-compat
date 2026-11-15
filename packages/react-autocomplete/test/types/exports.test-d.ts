import { expectTypeOf } from 'expect-type';
import type {
  ReactGoogleAutocompleteProps as UpstreamProps,
  usePlacesWidget as upstreamUsePlacesWidget,
} from 'upstream-rga';
import type upstreamUsePlacesAutocompleteService from 'upstream-rga/lib/usePlacesAutocompleteService';
import ReactGoogleAutocomplete, {
  type ReactGoogleAutocompleteInputProps,
  type ReactGoogleAutocompleteProps,
  usePlacesWidget,
} from '../../src';
import usePlacesAutocompleteService from '../../src/usePlacesAutocompleteService';
import usePlacesService from '../../src/usePlacesService';
import usePlacesWidgetDefault from '../../src/usePlacesWidget';

type Upstream = typeof import('upstream-rga');
type UpstreamService = typeof import('upstream-rga/lib/usePlacesAutocompleteService');
type Ours = typeof import('../../src');
type OursService = typeof import('../../src/usePlacesAutocompleteService');

expectTypeOf<keyof Ours>().toEqualTypeOf<keyof Upstream>();
expectTypeOf<keyof Ours>().toEqualTypeOf<'default' | 'usePlacesWidget'>();
expectTypeOf<keyof OursService>().toEqualTypeOf<keyof UpstreamService>();
expectTypeOf<keyof OursService>().toEqualTypeOf<'default'>();

expectTypeOf(ReactGoogleAutocomplete).toBeFunction();
expectTypeOf(usePlacesWidget).toBeFunction();
expectTypeOf(usePlacesWidget).toEqualTypeOf(usePlacesWidgetDefault);
expectTypeOf(usePlacesAutocompleteService).toBeFunction();
expectTypeOf(usePlacesService).toEqualTypeOf(usePlacesAutocompleteService);

expectTypeOf<ReactGoogleAutocompleteInputProps>().toExtend<ReactGoogleAutocompleteProps>();
expectTypeOf<ReactGoogleAutocompleteProps>().toEqualTypeOf<UpstreamProps>();
expectTypeOf<UpstreamProps>().toEqualTypeOf<ReactGoogleAutocompleteProps>();

expectTypeOf(usePlacesWidget).toEqualTypeOf<typeof upstreamUsePlacesWidget>();
expectTypeOf<typeof upstreamUsePlacesWidget>().toEqualTypeOf(usePlacesWidget);
expectTypeOf(usePlacesWidget).parameters.toEqualTypeOf<
  Parameters<typeof upstreamUsePlacesWidget>
>();

expectTypeOf(usePlacesAutocompleteService).parameters.toEqualTypeOf<
  Parameters<typeof upstreamUsePlacesAutocompleteService>
>();
expectTypeOf<Parameters<typeof upstreamUsePlacesAutocompleteService>>().toEqualTypeOf<
  Parameters<typeof usePlacesAutocompleteService>
>();
expectTypeOf(usePlacesAutocompleteService).returns.toEqualTypeOf<
  ReturnType<typeof upstreamUsePlacesAutocompleteService>
>();
expectTypeOf(usePlacesAutocompleteService).toEqualTypeOf<
  typeof upstreamUsePlacesAutocompleteService
>();
