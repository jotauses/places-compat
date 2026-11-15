import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  loadFixture,
  renderCompat,
} from '@places-compat/core/testing';
import { act, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlacesAutocomplete from '../../src/PlacesAutocomplete';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;
type RenderArg = Parameters<Props['children']>[0];
type Options = Record<string, unknown>;

const PLACE_IDS = loadFixture('rpa-mock-suggestions').new.suggestions.map(
  (suggestion) => suggestion.placePrediction?.placeId as string,
);
const DESCRIPTIONS = loadFixture('rpa-mock-suggestions').legacy.predictions.map(
  (prediction) => prediction.description,
);

interface MountOptions {
  props?: Partial<Props>;
  inputOptions?: Options;
  itemOptions?: Options;
}

interface ControlledProps {
  extra: Partial<Props>;
  record(value: string): void;
  render: Props['children'];
  instance: React.Ref<PlacesAutocomplete>;
}

function Controlled({ extra, record, render, instance }: ControlledProps): React.ReactElement {
  const [value, setValue] = React.useState('');
  return (
    <PlacesAutocomplete
      ref={instance}
      value={value}
      onChange={(next) => {
        record(next);
        setValue(next);
      }}
      {...extra}
    >
      {render}
    </PlacesAutocomplete>
  );
}

function mount({ props = {}, inputOptions = {}, itemOptions = {} }: MountOptions = {}) {
  const onChange = vi.fn();
  const ref = React.createRef<PlacesAutocomplete>();
  const seen: RenderArg[] = [];
  const children = (arg: RenderArg) => {
    seen.push(arg);
    return (
      <div>
        <input
          {...(arg.getInputProps(inputOptions) as React.InputHTMLAttributes<HTMLInputElement>)}
        />
        {arg.suggestions.map((suggestion) => {
          const { key, ...rest } = arg.getSuggestionItemProps(suggestion, itemOptions);
          return (
            <div key={String(key)} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
              {suggestion.description}
            </div>
          );
        })}
      </div>
    );
  };
  const rendered = renderCompat(
    <Controlled extra={props} record={onChange} render={children} instance={ref} />,
  );
  const input = () => rendered.container.querySelector('input') as HTMLInputElement;
  const item = (index: number) =>
    rendered.container.querySelectorAll('[role="option"]')[index] as HTMLElement;
  const latest = () => seen[seen.length - 1] as RenderArg;
  return {
    ...rendered,
    ref,
    input,
    item,
    latest,
    onChange,
    active: () => latest().suggestions.findIndex((suggestion) => suggestion.active),
    count: () => latest().suggestions.length,
    flag: () =>
      (ref.current as unknown as { mousedownOnSuggestion?: boolean }).mousedownOnSuggestion,
  };
}

async function searchSanFrancisco(input: HTMLInputElement): Promise<void> {
  fireEvent.change(input, { target: { value: 'San Francisco' } });
  await actCompat(() => {
    vi.advanceTimersByTime(200);
  });
}

function key(input: HTMLInputElement, name: string): boolean {
  return fireEvent.keyDown(input, { key: name });
}

let uninstall: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const fake = createFakeGoogle();
  uninstall = fake.install();
  applyFixture(fake.control, loadFixture('rpa-mock-suggestions'));
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

describe('getInputProps', () => {
  it('returns the original props and aria attributes', async () => {
    const { input, latest } = mount();
    expect(Object.keys(latest().getInputProps())).toEqual([
      'type',
      'autoComplete',
      'role',
      'aria-autocomplete',
      'aria-expanded',
      'aria-activedescendant',
      'disabled',
      'onKeyDown',
      'onBlur',
      'value',
      'onChange',
    ]);
    expect(input().getAttribute('type')).toBe('text');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);

    await searchSanFrancisco(input());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);

    key(input(), 'ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(
      `PlacesAutocomplete__suggestion-${PLACE_IDS[0]}`,
    );
  });

  it('lets options override the defaults but not the handlers or the value', () => {
    const { latest } = mount();
    const props = latest().getInputProps({
      type: 'search',
      disabled: true,
      onKeyDown: 'not a handler',
      className: 'field',
    });
    expect(props.type).toBe('search');
    expect(props.disabled).toBe(true);
    expect(props.className).toBe('field');
    expect(typeof props.onKeyDown).toBe('function');
    expect(props.value).toBe('');
  });

  it('throws when options carry value or onChange', () => {
    const { latest } = mount();
    expect(() => latest().getInputProps({ value: 'x' })).toThrow(
      '[react-places-autocomplete]: getInputProps does not accept `value`. Use `value` prop instead',
    );
    expect(() => latest().getInputProps({ onChange: () => {} })).toThrow(
      '[react-places-autocomplete]: getInputProps does not accept `onChange`. Use `onChange` prop instead',
    );
    expect(() => latest().getInputProps({ value: undefined })).toThrow('`value`');
  });

  it('only rejects own value and onChange properties', () => {
    const { latest } = mount();
    const inherited = Object.create({ value: 'x', onChange: () => {} }) as Options;
    expect(() => latest().getInputProps(inherited)).not.toThrow();
  });
});

describe('getSuggestionItemProps', () => {
  it('takes key and id from each placeId', async () => {
    const { input, item, latest } = mount();
    await searchSanFrancisco(input());
    latest().suggestions.forEach((suggestion, index) => {
      const props = latest().getSuggestionItemProps(suggestion);
      expect(props.key).toBe(PLACE_IDS[index]);
      expect(props.id).toBe(`PlacesAutocomplete__suggestion-${PLACE_IDS[index]}`);
      expect(props.role).toBe('option');
      expect(item(index).id).toBe(`PlacesAutocomplete__suggestion-${PLACE_IDS[index]}`);
    });
  });

  it('keeps the original key order with options spread first', async () => {
    const { input, latest } = mount();
    await searchSanFrancisco(input());
    const suggestion = latest().suggestions[0] as RenderArg['suggestions'][number];
    const props = latest().getSuggestionItemProps(suggestion, { className: 'item', key: 'mine' });
    expect(Object.keys(props)).toEqual([
      'className',
      'key',
      'id',
      'role',
      'onMouseEnter',
      'onMouseLeave',
      'onMouseDown',
      'onMouseUp',
      'onTouchStart',
      'onTouchEnd',
      'onClick',
    ]);
    expect(props.key).toBe(PLACE_IDS[0]);
  });
});

describe('handler composition', () => {
  it('runs the library input handlers first and passes the event to the user', async () => {
    const log: string[] = [];
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      log.push(`user ${event.key} ${event.isDefaultPrevented()}`);
    });
    const onBlur = vi.fn((event: React.FocusEvent) => {
      log.push(`user blur ${event.type}`);
    });
    const { input, count } = mount({
      props: { onSelect: (address) => log.push(`select ${address}`) },
      inputOptions: { onKeyDown, onBlur },
    });
    await searchSanFrancisco(input());

    key(input(), 'Enter');
    expect(log).toEqual(['select San Francisco', 'user Enter true']);

    fireEvent.change(input(), { target: { value: '' } });
    await searchSanFrancisco(input());
    expect(count()).toBe(5);
    fireEvent.blur(input());
    expect(count()).toBe(0);
    expect(log.slice(2)).toEqual(['user blur blur']);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('runs the library item handlers first and passes the event to the user', async () => {
    const log: string[] = [];
    const record =
      (name: string) =>
      (event: React.SyntheticEvent): void => {
        log.push(`${name} ${event.type} ${event.isDefaultPrevented()}`);
      };
    const { input, item, flag, active } = mount({
      props: { onSelect: (address) => log.push(`select ${address}`) },
      itemOptions: {
        onMouseEnter: record('user'),
        onMouseLeave: record('user'),
        onMouseDown: (event: React.MouseEvent) => {
          log.push(`user mousedown ${event.isDefaultPrevented()} ${flag()}`);
        },
        onMouseUp: (event: React.MouseEvent) => {
          log.push(`user mouseup ${event.type} ${flag()}`);
        },
        onTouchStart: (event: React.TouchEvent) => {
          log.push(`user touchstart ${event.type} ${flag()}`);
        },
        onTouchEnd: (event: React.TouchEvent) => {
          log.push(`user touchend ${event.type} ${flag()}`);
        },
        onClick: record('user'),
      },
    });
    await searchSanFrancisco(input());

    fireEvent.mouseEnter(item(1));
    expect(active()).toBe(1);
    fireEvent.mouseLeave(item(1));
    expect(active()).toBe(-1);
    fireEvent.mouseDown(item(1));
    fireEvent.mouseUp(item(1));
    fireEvent.touchStart(item(1));
    fireEvent.touchEnd(item(1));
    fireEvent.click(item(1));

    expect(log).toEqual([
      'user mouseenter false',
      'user mouseleave false',
      'user mousedown true true',
      'user mouseup mouseup false',
      'user touchstart touchstart true',
      'user touchend touchend false',
      `select ${DESCRIPTIONS[1]}`,
      'user click true',
    ]);
  });
});

describe('keyboard', () => {
  it('prevents the default action only for Enter, ArrowDown and ArrowUp', async () => {
    const { input } = mount();
    expect(key(input(), 'ArrowDown')).toBe(false);
    expect(key(input(), 'ArrowUp')).toBe(false);
    expect(key(input(), 'Escape')).toBe(true);
    expect(key(input(), 'Tab')).toBe(true);
    expect(key(input(), 'a')).toBe(true);
    expect(key(input(), 'Enter')).toBe(false);

    await searchSanFrancisco(input());
    expect(key(input(), 'ArrowDown')).toBe(false);
    expect(key(input(), 'ArrowUp')).toBe(false);
    expect(key(input(), 'Tab')).toBe(true);
    expect(key(input(), 'Escape')).toBe(true);
  });

  it('moves through the list and returns to the typed value past either end', async () => {
    const { input, onChange, active, count } = mount();
    await searchSanFrancisco(input());
    onChange.mockClear();

    key(input(), 'ArrowDown');
    expect(active()).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(DESCRIPTIONS[0]);
    expect(input().value).toBe(DESCRIPTIONS[0]);

    key(input(), 'ArrowUp');
    expect(active()).toBe(-1);
    expect(onChange).toHaveBeenLastCalledWith('San Francisco');

    key(input(), 'ArrowUp');
    expect(active()).toBe(4);
    expect(onChange).toHaveBeenLastCalledWith(DESCRIPTIONS[4]);

    key(input(), 'ArrowUp');
    expect(active()).toBe(3);
    expect(onChange).toHaveBeenLastCalledWith(DESCRIPTIONS[3]);

    key(input(), 'ArrowDown');
    key(input(), 'ArrowDown');
    expect(active()).toBe(-1);
    expect(onChange).toHaveBeenLastCalledWith('San Francisco');
    expect(input().value).toBe('San Francisco');
    expect(count()).toBe(5);
  });

  it('does nothing on arrows without suggestions', () => {
    const { input, onChange } = mount();
    key(input(), 'ArrowDown');
    key(input(), 'ArrowUp');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects the input value on Enter without an active suggestion', async () => {
    const onSelect = vi.fn();
    const { input, count } = mount({ props: { onSelect } });
    await searchSanFrancisco(input());
    key(input(), 'Enter');
    expect(onSelect).toHaveBeenCalledWith('San Francisco', null, null);
    expect(count()).toBe(0);
  });

  it('selects the active suggestion on Enter with three arguments', async () => {
    const onSelect = vi.fn();
    const { input, latest } = mount({ props: { onSelect } });
    await searchSanFrancisco(input());
    key(input(), 'ArrowDown');
    key(input(), 'ArrowDown');
    const selected = latest().suggestions[1];
    key(input(), 'Enter');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(DESCRIPTIONS[1], PLACE_IDS[1], selected);
    expect(latest().suggestions).toEqual([]);
  });

  it('calls onChange with the address when there is no onSelect', async () => {
    const { input, onChange } = mount();
    await searchSanFrancisco(input());
    key(input(), 'ArrowDown');
    onChange.mockClear();
    key(input(), 'Enter');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(DESCRIPTIONS[0]);
  });

  it('clears the suggestions on Escape', async () => {
    const { input, count, onChange } = mount();
    await searchSanFrancisco(input());
    onChange.mockClear();
    key(input(), 'Escape');
    expect(count()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the suggestions alone on Tab', async () => {
    const { input, count } = mount();
    await searchSanFrancisco(input());
    key(input(), 'Tab');
    expect(count()).toBe(5);
  });
});

describe('mouse, touch and blur', () => {
  it('clears on blur unless the mouse is down on a suggestion', async () => {
    const { input, item, count, flag } = mount();
    await searchSanFrancisco(input());

    expect(fireEvent.mouseDown(item(2))).toBe(false);
    expect(flag()).toBe(true);
    fireEvent.blur(input());
    expect(count()).toBe(5);

    fireEvent.mouseUp(item(2));
    expect(flag()).toBe(false);
    fireEvent.blur(input());
    expect(count()).toBe(0);
  });

  it('lowers the flag and clears the active suggestion on mouseleave', async () => {
    const { input, item, count, flag, active } = mount();
    await searchSanFrancisco(input());
    fireEvent.mouseEnter(item(2));
    expect(active()).toBe(2);
    fireEvent.mouseDown(item(2));
    fireEvent.mouseLeave(item(2));
    expect(flag()).toBe(false);
    expect(active()).toBe(-1);
    fireEvent.blur(input());
    expect(count()).toBe(0);
  });

  it('keeps the suggestions on blur during a touch', async () => {
    const { input, item, count, flag } = mount();
    await searchSanFrancisco(input());

    expect(fireEvent.touchStart(item(0))).toBe(true);
    expect(flag()).toBe(true);
    fireEvent.blur(input());
    expect(count()).toBe(5);

    fireEvent.touchEnd(item(0));
    expect(flag()).toBe(false);
    fireEvent.blur(input());
    expect(count()).toBe(0);
  });

  it('selects on click, prevents the default and lowers the flag after a timeout', async () => {
    const onSelect = vi.fn();
    const { input, item, latest, flag, count } = mount({ props: { onSelect } });
    await searchSanFrancisco(input());
    const suggestion = latest().suggestions[3];

    fireEvent.mouseDown(item(3));
    expect(fireEvent.click(item(3))).toBe(false);
    expect(onSelect).toHaveBeenCalledWith(DESCRIPTIONS[3], PLACE_IDS[3], suggestion);
    expect(count()).toBe(0);
    expect(flag()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(flag()).toBe(false);
  });

  it('accepts a click without an event', async () => {
    const onSelect = vi.fn();
    const { input, latest } = mount({ props: { onSelect } });
    await searchSanFrancisco(input());
    const suggestion = latest().suggestions[0] as RenderArg['suggestions'][number];
    const { onClick } = latest().getSuggestionItemProps(suggestion) as { onClick(): void };
    act(() => onClick());
    expect(onSelect).toHaveBeenCalledWith(DESCRIPTIONS[0], PLACE_IDS[0], suggestion);
  });

  it('calls onChange with the description on click when there is no onSelect', async () => {
    const { input, item, onChange } = mount();
    await searchSanFrancisco(input());
    onChange.mockClear();
    fireEvent.click(item(1));
    expect(onChange).toHaveBeenCalledWith(DESCRIPTIONS[1]);
    expect(input().value).toBe(DESCRIPTIONS[1]);
  });
});

describe('class contract', () => {
  it('keeps the original propTypes and defaultProps', () => {
    const statics = PlacesAutocomplete as unknown as {
      propTypes: Record<string, unknown>;
      defaultProps: Record<string, unknown>;
    };
    expect(Object.keys(statics.propTypes)).toEqual([
      'onChange',
      'value',
      'children',
      'onError',
      'onSelect',
      'searchOptions',
      'debounce',
      'highlightFirstSuggestion',
      'shouldFetchSuggestions',
      'googleCallbackName',
    ]);
    expect(statics.defaultProps).toEqual({
      onError: expect.any(Function),
      searchOptions: {},
      debounce: 200,
      highlightFirstSuggestion: false,
      shouldFetchSuggestions: true,
    });
  });

  it('exposes the instance to a ref', async () => {
    const { input, ref, count } = mount();
    await searchSanFrancisco(input());
    expect(ref.current).toBeInstanceOf(PlacesAutocomplete);
    act(() => ref.current?.clearSuggestions());
    expect(count()).toBe(0);
  });

  it('passes the render-prop keys in the original order', () => {
    const { latest } = mount();
    expect(Object.keys(latest())).toEqual([
      'getInputProps',
      'getSuggestionItemProps',
      'loading',
      'suggestions',
    ]);
  });
});
