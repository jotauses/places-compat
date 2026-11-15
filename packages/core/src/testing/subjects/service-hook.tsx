import { normalize } from '../normalize';
import { actCompat, renderHookCompat } from '../render';
import type { Mounted, Step, Subject } from '../types';
import { moduleExport, notApplicable, once, Recorder, unknownCall } from './shared';

interface ServiceResult {
  placesService: unknown;
  autocompleteSessionToken: unknown;
  placesAutocompleteService: unknown;
  placePredictions: unknown[];
  isPlacePredictionsLoading: boolean;
  getPlacePredictions(opt: unknown): void;
  queryPredictions: unknown[];
  isQueryPredictionsLoading: boolean;
  getQueryPredictions(opt: unknown): void;
  refreshSessionToken(): void;
}

type Hook = (props: Record<string, unknown>) => ServiceResult;

const NAME = 'serviceHookSubject';
const CALLS = ['getPlacePredictions', 'getQueryPredictions', 'refreshSessionToken'] as const;

export function serviceHookSubject(mod: unknown): Subject {
  return {
    name: NAME,
    mount(env): Mounted {
      const useService = moduleExport<Hook>(mod, 'default', NAME);
      const loading = new Recorder<boolean>();
      const handle = renderHookCompat(
        (current: Record<string, unknown>) => {
          const result = useService(current);
          loading.push(result.isPlacePredictionsLoading);
          return result;
        },
        { initialProps: env.props, ...(env.strict ? { strict: true } : {}) },
      );
      const unmount = once(() => handle.unmount());
      return {
        async act(step: Step) {
          const result = handle.result.current;
          switch (step.type) {
            case 'type':
              await actCompat(() => result.getPlacePredictions({ input: step.text }));
              return;
            case 'call': {
              const name = CALLS.find((call) => call === step.name);
              if (!name) throw unknownCall(step.name, NAME);
              const fn = result[name] as (...args: unknown[]) => void;
              await actCompat(() => fn(...(step.args ?? [])));
              return;
            }
            case 'rerender':
              handle.rerender(step.props);
              return;
            case 'unmount':
              unmount();
              return;
            default:
              throw notApplicable(step, NAME);
          }
        },
        snapshot() {
          const result = handle.result.current;
          return {
            placePredictions: result.placePredictions,
            isPlacePredictionsLoading: result.isPlacePredictionsLoading,
            queryPredictions: result.queryPredictions,
            isQueryPredictionsLoading: result.isQueryPredictionsLoading,
            placesService: result.placesService != null,
            placesAutocompleteService: result.placesAutocompleteService != null,
            autocompleteSessionToken: normalize(result.autocompleteSessionToken),
          };
        },
        loadingSeen: () => loading.drain(),
        callbacks: () => [],
        unmount,
      };
    },
  };
}
