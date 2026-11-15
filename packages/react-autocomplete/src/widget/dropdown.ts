import { createAttribution } from './attribution';

type Prediction = google.maps.places.AutocompletePrediction;
type Substring = google.maps.places.PredictionSubstring;

export interface DropdownHandlers {
  onSelect(prediction: Prediction): void;
  onEnterWithoutSelection(): void;
}

export interface Dropdown {
  setPredictions(predictions: Prediction[]): void;
  clear(): void;
  destroy(): void;
}

const INPUT_ATTRIBUTES = [
  'role',
  'aria-autocomplete',
  'aria-expanded',
  'aria-controls',
  'aria-activedescendant',
] as const;

let counter = 0;

function appendMatched(
  doc: Document,
  parent: HTMLElement,
  text: string,
  ranges: readonly Substring[] | undefined,
): void {
  const sorted = (ranges ?? [])
    .filter((range) => range && typeof range.offset === 'number' && range.length > 0)
    .slice()
    .sort((a, b) => a.offset - b.offset);
  let done = 0;
  for (const range of sorted) {
    const start = Math.max(range.offset, done);
    const end = Math.min(range.offset + range.length, text.length);
    if (end <= start) continue;
    if (start > done) parent.appendChild(doc.createTextNode(text.slice(done, start)));
    const matched = doc.createElement('span');
    matched.className = 'pac-matched';
    matched.textContent = text.slice(start, end);
    parent.appendChild(matched);
    done = end;
  }
  if (done < text.length) parent.appendChild(doc.createTextNode(text.slice(done)));
}

export function createDropdown(input: HTMLInputElement, handlers: DropdownHandlers): Dropdown {
  const doc = input.ownerDocument;
  const view = doc.defaultView;
  counter += 1;
  const listId = `pac-listbox-${counter}`;

  const container = doc.createElement('div');
  container.className = 'pac-container';
  container.id = listId;
  container.setAttribute('role', 'listbox');
  container.style.position = 'absolute';
  container.style.zIndex = '1000';
  container.style.display = 'none';
  doc.body.appendChild(container);

  const saved = INPUT_ATTRIBUTES.map((name) => [name, input.getAttribute(name)] as const);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.removeAttribute('aria-activedescendant');

  let predictions: Prediction[] = [];
  let items: HTMLDivElement[] = [];
  let active = -1;
  let open = false;
  let blurred = false;
  let dismissed = false;
  let destroyed = false;
  let typed = input.value;

  const position = () => {
    if (!open) return;
    const rect = input.getBoundingClientRect();
    const scrollX = view ? view.scrollX : 0;
    const scrollY = view ? view.scrollY : 0;
    container.style.top = `${rect.bottom + scrollY}px`;
    container.style.left = `${rect.left + scrollX}px`;
    container.style.width = `${rect.width}px`;
  };

  const highlight = (index: number, showInInput: boolean) => {
    const previous = items[active];
    if (previous) {
      previous.classList.remove('pac-item-selected');
      previous.setAttribute('aria-selected', 'false');
    }
    active = index;
    const next = items[index];
    if (next) {
      next.classList.add('pac-item-selected');
      next.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', next.id);
    } else {
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }
    if (showInInput) {
      const prediction = predictions[active];
      input.value = prediction ? prediction.description : typed;
    }
  };

  const hide = () => {
    highlight(-1, false);
    open = false;
    container.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
  };

  const show = () => {
    open = true;
    container.style.display = '';
    input.setAttribute('aria-expanded', 'true');
    position();
  };

  const select = (index: number) => {
    const prediction = predictions[index];
    if (!prediction) return;
    dismissed = true;
    hide();
    render([]);
    handlers.onSelect(prediction);
    typed = input.value;
  };

  const buildItem = (prediction: Prediction, index: number): HTMLDivElement => {
    const item = doc.createElement('div');
    item.className = 'pac-item';
    item.id = `${listId}-option-${index}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');

    const icon = doc.createElement('span');
    icon.className = 'pac-icon pac-icon-marker';
    icon.setAttribute('aria-hidden', 'true');

    const formatting = prediction.structured_formatting;
    const mainText = formatting?.main_text ?? prediction.description ?? '';
    const query = doc.createElement('span');
    query.className = 'pac-item-query';
    appendMatched(doc, query, mainText, formatting?.main_text_matched_substrings);

    const secondary = doc.createElement('span');
    secondary.textContent = formatting?.secondary_text ?? '';

    item.appendChild(icon);
    item.appendChild(query);
    item.appendChild(secondary);

    const onHover = () => {
      if (active !== index) highlight(index, false);
    };
    item.addEventListener('mouseenter', onHover);
    item.addEventListener('mouseover', onHover);
    item.addEventListener('mousedown', (event) => {
      event.preventDefault();
      select(index);
    });
    return item;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (items.length === 0) return;
        event.preventDefault();
        if (!open) {
          dismissed = false;
          show();
          return;
        }
        const count = items.length;
        const next =
          event.key === 'ArrowDown'
            ? active + 1 >= count
              ? -1
              : active + 1
            : active === -1
              ? count - 1
              : active - 1;
        highlight(next, true);
        return;
      }
      case 'Enter':
        if (open && active !== -1) {
          event.preventDefault();
          select(active);
          return;
        }
        dismissed = true;
        hide();
        handlers.onEnterWithoutSelection();
        return;
      case 'Escape':
        if (!open) return;
        dismissed = true;
        if (active !== -1) highlight(-1, true);
        hide();
        return;
      case 'Tab':
        dismissed = true;
        hide();
        return;
      default:
        return;
    }
  };

  const onInput = () => {
    blurred = false;
    dismissed = false;
    typed = input.value;
    highlight(-1, false);
  };

  const onFocus = () => {
    blurred = false;
  };

  const onBlur = () => {
    blurred = true;
    hide();
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('input', onInput);
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur', onBlur);
  view?.addEventListener('resize', position);
  view?.addEventListener('scroll', position, true);

  const render = (list: Prediction[]) => {
    if (active !== -1) highlight(-1, true);
    predictions = list.slice();
    items = predictions.map(buildItem);
    container.textContent = '';
    for (const item of items) container.appendChild(item);
    if (items.length > 0) container.appendChild(createAttribution(doc));
  };

  return {
    setPredictions(list) {
      if (destroyed) return;
      render(Array.isArray(list) ? list : []);
      if (items.length > 0 && !blurred && !dismissed) show();
      else hide();
    },
    clear() {
      if (destroyed) return;
      render([]);
      hide();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('input', onInput);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
      view?.removeEventListener('resize', position);
      view?.removeEventListener('scroll', position, true);
      container.remove();
      for (const [name, value] of saved) {
        if (value === null) input.removeAttribute(name);
        else input.setAttribute(name, value);
      }
      predictions = [];
      items = [];
    },
  };
}
