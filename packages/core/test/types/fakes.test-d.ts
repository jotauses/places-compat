import { expectTypeOf } from 'expect-type';
import { createLegacyFakeGoogle } from '../../src/testing/fake-legacy';
import { createFakeGoogle, fakeMapsError } from '../../src/testing/fake-new';
import type { FakeControl, LegacyControl } from '../../src/testing/types';

expectTypeOf(createFakeGoogle).parameter(0).toEqualTypeOf<
  | {
      places?: 'present' | 'viaImportLibrary' | 'legacyOnly' | 'absent';
      importLibrary?: boolean;
      validation?: 'reject' | 'throw';
      mapsApiFlag?: boolean;
    }
  | undefined
>();
expectTypeOf(createFakeGoogle).returns.toEqualTypeOf<{
  google: typeof google;
  control: FakeControl;
  install(): () => void;
}>();

expectTypeOf(createLegacyFakeGoogle)
  .parameter(0)
  .toEqualTypeOf<{ places?: 'present' | 'absent' } | undefined>();
expectTypeOf(createLegacyFakeGoogle).returns.toEqualTypeOf<{
  google: typeof google;
  control: LegacyControl;
  install(): () => void;
}>();

expectTypeOf(fakeMapsError).toEqualTypeOf<(code: string, endpoint?: string) => Error>();

// @ts-expect-error: unknown places mode
createFakeGoogle({ places: 'legacy' });
// @ts-expect-error: the legacy fake has no new-API modes
createLegacyFakeGoogle({ places: 'viaImportLibrary' });
