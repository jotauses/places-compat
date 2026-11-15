import { fireEvent } from '@testing-library/react';
import React from 'react';
import { actCompat, renderCompat } from '../render';
import type { LegacyControl, Mounted, Step, Subject } from '../types';
import {
  type CallbackLog,
  moduleExport,
  notApplicable,
  once,
  Recorder,
  unknownCall,
} from './shared';

type Props = Record<string, unknown>;
type RefLike = { current: unknown };
type WidgetHook = (props: Props) => { ref: React.Ref<HTMLInputElement>; autocompleteRef: RefLike };

const NAME = 'widgetSubject';

export const RECORDED_SETTERS = [
  'setBounds',
  'setComponentRestrictions',
  'setFields',
  'setOptions',
  'setTypes',
] as const;

type RecordFn = (name: string, args: unknown[]) => void;

const views = new WeakMap<object, object>();

function canShadow(instance: object, method: string): boolean {
  const own = Object.getOwnPropertyDescriptor(instance, method);
  return own ? own.configurable === true : Object.isExtensible(instance);
}

function recordingSetter(method: string, original: unknown, record: RecordFn) {
  return function (this: unknown, ...args: unknown[]) {
    record(`autocomplete.${method}`, args);
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
}

function recordingView(instance: object, methods: readonly string[], record: RecordFn): object {
  const cache = new Map<PropertyKey, { value: unknown; fn: unknown }>();
  return new Proxy(Object.create(Object.getPrototypeOf(instance)) as object, {
    get(_target, key) {
      const value: unknown = Reflect.get(instance, key);
      if (typeof value !== 'function') return value;
      const hit = cache.get(key);
      if (hit && hit.value === value) return hit.fn;
      const fn =
        typeof key === 'string' && methods.includes(key)
          ? recordingSetter(key, value, record).bind(instance)
          : (value as (...a: unknown[]) => unknown).bind(instance);
      cache.set(key, { value, fn });
      return fn;
    },
    has: (_target, key) => Reflect.has(instance, key),
    set: (_target, key, value) => Reflect.set(instance, key, value),
  });
}

function instrument(instance: unknown, record: RecordFn): unknown {
  if (typeof instance !== 'object' || instance === null) return instance;
  const known = views.get(instance);
  if (known) return known;
  const target = instance as Record<string, unknown>;
  const methods = RECORDED_SETTERS.filter((method) => typeof target[method] === 'function');
  let view: object = instance;
  if (methods.every((method) => canShadow(instance, method))) {
    for (const method of methods) {
      Object.defineProperty(target, method, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: recordingSetter(method, target[method], record),
      });
    }
  } else {
    view = recordingView(instance, methods, record);
  }
  views.set(instance, view);
  return view;
}

const instrumented = new WeakSet<object>();

function instrumentRef(ref: RefLike, record: RecordFn): void {
  if (instrumented.has(ref)) return;
  instrumented.add(ref);
  let current = instrument(ref.current, record);
  Object.defineProperty(ref, 'current', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (next: unknown) => {
      current = instrument(next, record);
    },
  });
}

interface HarnessProps {
  hook: WidgetHook;
  props: Props;
  onPlaceSelected(...args: unknown[]): void;
  record(name: string, args: unknown[]): void;
}

// React 17 seals useRef objects in development; skipping that lets ref.current become an accessor.
function withoutSeal<T>(fn: () => T): T {
  const seal = Object.seal;
  Object.seal = <O,>(object: O): O => object;
  try {
    return fn();
  } finally {
    Object.seal = seal;
  }
}

function Harness({ hook, props, onPlaceSelected, record }: HarnessProps): React.ReactElement {
  const { ref, autocompleteRef } = withoutSeal(() => hook({ ...props, onPlaceSelected }));
  instrumentRef(autocompleteRef, record);
  return <input ref={ref} />;
}

function hasLegacyControl(control: unknown): control is LegacyControl {
  return (
    typeof control === 'object' &&
    control !== null &&
    typeof (control as LegacyControl).selectPlace === 'function'
  );
}

export function widgetSubject(mod: unknown): Subject {
  return {
    name: NAME,
    mount(env): Mounted {
      const hook = moduleExport<WidgetHook>(mod, 'usePlacesWidget', NAME);
      const calls = new Recorder<CallbackLog[number]>();
      const record = (name: string, args: unknown[]) => calls.push({ name, args });
      const onPlaceSelected = (...args: unknown[]) => record('onPlaceSelected', args);
      const element = (props: Props) => (
        <Harness hook={hook} props={props} onPlaceSelected={onPlaceSelected} record={record} />
      );
      const rendered = renderCompat(element(env.props), env.strict ? { strict: true } : {});
      const unmount = once(() => rendered.unmount());
      const field = rendered.container.querySelector('input') as HTMLInputElement;
      const control = hasLegacyControl(env.control) ? env.control : undefined;
      const pacItem = (index: number) => {
        const found = document.querySelectorAll('.pac-item')[index];
        if (!found) throw new Error(`${NAME}: there is no .pac-item number ${index}`);
        return found;
      };
      return {
        async act(step: Step) {
          switch (step.type) {
            case 'type':
              fireEvent.input(field, { target: { value: step.text } });
              fireEvent.change(field, { target: { value: step.text } });
              return;
            case 'call': {
              const args = step.args ?? [];
              if (step.name === 'selectPlace') {
                const index = typeof args[1] === 'number' ? args[1] : 0;
                if (control) {
                  const place = args[0] as google.maps.places.PlaceResult;
                  await actCompat(() => control.selectPlace(place, index));
                } else {
                  const target = pacItem(index);
                  fireEvent.mouseDown(target);
                  fireEvent.click(target);
                }
                return;
              }
              if (step.name === 'enterWithoutSelection') {
                const index = typeof args[0] === 'number' ? args[0] : 0;
                if (control) await actCompat(() => control.enterWithoutSelection(index));
                else fireEvent.keyDown(field, { key: 'Enter' });
                return;
              }
              throw unknownCall(step.name, NAME);
            }
            case 'key':
              fireEvent.keyDown(field, { key: step.key });
              return;
            case 'hover':
              fireEvent.mouseEnter(pacItem(step.index));
              return;
            case 'click': {
              const target = pacItem(step.index);
              fireEvent.mouseDown(target);
              fireEvent.click(target);
              return;
            }
            case 'focus':
              fireEvent.focus(field);
              return;
            case 'blur':
              fireEvent.blur(field);
              return;
            case 'rerender':
              rendered.rerender(element(step.props));
              return;
            case 'unmount':
              unmount();
              return;
            default:
              throw notApplicable(step, NAME);
          }
        },
        snapshot: () => ({}),
        loadingSeen: () => [],
        callbacks: () => calls.drain(),
        unmount,
      };
    },
  };
}
