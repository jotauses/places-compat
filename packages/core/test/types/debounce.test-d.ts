import { expectTypeOf } from 'expect-type';
import { debounce } from '../../src';

const debounced = debounce((_query: string, _limit: number) => {}, 100);

expectTypeOf(debounced).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(debounced).returns.toEqualTypeOf<void>();
expectTypeOf(debounced.cancel).toEqualTypeOf<() => void>();
