import { actCompat, renderHookCompat } from '../render';
import type { Mounted, Step, Subject } from '../types';
import { moduleExport, notApplicable, once, Recorder, readStorage, unknownCall } from './shared';

interface HookResult {
  ready: boolean;
  value: string;
  suggestions: { loading: boolean; status: string; data: unknown[] };
  setValue(value: string, shouldFetchData?: boolean): void;
  clearSuggestions(): void;
  clearCache(key?: string): void;
  init(): void;
}

type Hook = (props: Record<string, unknown>) => HookResult;

const NAME = 'hookSubject';
const CALLS = ['setValue', 'clearSuggestions', 'clearCache', 'init'] as const;

export function hookSubject(mod: unknown): Subject {
  return {
    name: NAME,
    mount(env): Mounted {
      const useHook = moduleExport<Hook>(mod, 'default', NAME);
      const loading = new Recorder<boolean>();
      let props = env.props;
      const handle = renderHookCompat(
        (current: Record<string, unknown>) => {
          const result = useHook(current);
          loading.push(result.suggestions.loading);
          return result;
        },
        { initialProps: props, ...(env.strict ? { strict: true } : {}) },
      );
      const unmount = once(() => handle.unmount());
      return {
        async act(step: Step) {
          const result = handle.result.current;
          switch (step.type) {
            case 'type':
              await actCompat(() => result.setValue(step.text));
              return;
            case 'call': {
              const name = CALLS.find((call) => call === step.name);
              if (!name) throw unknownCall(step.name, NAME);
              const fn = result[name] as (...args: unknown[]) => void;
              await actCompat(() => fn(...(step.args ?? [])));
              return;
            }
            case 'rerender':
              props = step.props;
              handle.rerender(props);
              return;
            case 'unmount':
              unmount();
              return;
            default:
              throw notApplicable(step, NAME);
          }
        },
        snapshot() {
          const { ready, value, suggestions } = handle.result.current;
          const cacheKey = typeof props.cacheKey === 'string' ? props.cacheKey : 'upa';
          return { ready, value, suggestions, storage: readStorage(cacheKey) };
        },
        loadingSeen: () => loading.drain(),
        callbacks: () => [],
        unmount,
      };
    },
  };
}
