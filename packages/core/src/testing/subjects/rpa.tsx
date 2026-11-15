import { fireEvent } from '@testing-library/react';
import React from 'react';
import { renderCompat } from '../render';
import type { Mounted, Step, Subject } from '../types';
import { type CallbackLog, moduleExport, notApplicable, once, Recorder } from './shared';

type Props = Record<string, unknown>;

interface RenderArg {
  getInputProps(options?: Props): Props;
  getSuggestionItemProps(suggestion: unknown, options?: Props): Props;
  loading: boolean;
  suggestions: unknown[];
}

interface Seen {
  renderArg: { loading: boolean; suggestions: unknown[] };
  inputProps: Props;
  itemProps: Props[];
}

interface HarnessProps {
  Lib: React.ComponentType<Props>;
  props: Props;
  record(name: string, args: unknown[]): void;
  onRender(seen: Seen): void;
}

const NAME = 'rpaSubject';

function Harness({ Lib, props, record, onRender }: HarnessProps): React.ReactElement {
  const initial = typeof props.value === 'string' ? props.value : '';
  const [value, setValue] = React.useState(initial);
  const [lastProp, setLastProp] = React.useState(props.value);
  if (props.value !== lastProp) {
    setLastProp(props.value);
    if (typeof props.value === 'string') setValue(props.value);
  }
  const { onError, ...rest } = props;
  const libProps: Props = {
    ...rest,
    value,
    onChange: (next: string) => {
      record('onChange', [next]);
      setValue(next);
    },
    onSelect: (...args: unknown[]) => record('onSelect', args),
    children: (arg: RenderArg) => {
      const inputProps = arg.getInputProps();
      const itemProps = arg.suggestions.map((suggestion) => arg.getSuggestionItemProps(suggestion));
      onRender({
        renderArg: { loading: arg.loading, suggestions: arg.suggestions },
        inputProps,
        itemProps,
      });
      return (
        <div>
          <input {...inputProps} />
          {itemProps.map(({ key, ...item }, index) => (
            <div key={typeof key === 'string' ? key : index} {...item}>
              {String((arg.suggestions[index] as { description?: unknown }).description)}
            </div>
          ))}
        </div>
      );
    },
  };
  if (onError !== 'default') libProps.onError = (...args: unknown[]) => record('onError', args);
  return <Lib {...libProps} />;
}

export function rpaSubject(mod: unknown): Subject {
  return {
    name: NAME,
    mount(env): Mounted {
      const Lib = moduleExport<React.ComponentType<Props>>(mod, 'default', NAME);
      const calls = new Recorder<CallbackLog[number]>();
      const loading = new Recorder<boolean>();
      let last: Seen | undefined;
      const record = (name: string, args: unknown[]) => calls.push({ name, args });
      const onRender = (seen: Seen) => {
        last = seen;
        loading.push(seen.renderArg.loading);
      };
      const element = (props: Props) => (
        <Harness Lib={Lib} props={props} record={record} onRender={onRender} />
      );
      const rendered = renderCompat(element(env.props), env.strict ? { strict: true } : {});
      const unmount = once(() => rendered.unmount());
      const input = () => {
        const found = rendered.container.querySelector('input');
        if (!found) throw new Error(`${NAME}: the input is not mounted`);
        return found;
      };
      const item = (index: number) => {
        const found = rendered.container.querySelectorAll('[role="option"]')[index];
        if (!found) throw new Error(`${NAME}: there is no suggestion number ${index}`);
        return found;
      };
      return {
        act(step: Step) {
          switch (step.type) {
            case 'type':
              fireEvent.change(input(), { target: { value: step.text } });
              return;
            case 'key':
              fireEvent.keyDown(input(), { key: step.key });
              return;
            case 'hover':
              fireEvent.mouseEnter(item(step.index));
              return;
            case 'click': {
              const target = item(step.index);
              fireEvent.mouseDown(target);
              fireEvent.mouseUp(target);
              fireEvent.click(target);
              return;
            }
            case 'focus':
              fireEvent.focus(input());
              return;
            case 'blur':
              fireEvent.blur(input());
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
        snapshot: () => last ?? null,
        loadingSeen: () => loading.drain(),
        callbacks: () => calls.drain(),
        unmount,
      };
    },
  };
}
