import {
  debounce,
  fetchPredictions as fetchPlacePredictions,
  getPlaces,
  type LegacyStatus,
  loadPlaces,
  NEW_API_HINT,
  PlacesUnavailableError,
} from '@places-compat/core';
import PropTypes from 'prop-types';
import * as React from 'react';
import { compose } from './compose';

type Prediction = google.maps.places.AutocompletePrediction;

interface Suggestion {
  id: undefined;
  description: string;
  placeId: string;
  active: boolean;
  index: number;
  formattedSuggestion: { mainText: string; secondaryText: string };
  matchedSubstrings: google.maps.places.PredictionSubstring[];
  terms: google.maps.places.PredictionTerm[];
  types: string[];
}

type Options = Record<string, unknown>;
type UserHandler = (...args: unknown[]) => unknown;

interface KeyEventLike {
  key: string;
  preventDefault(): void;
}

interface ChangeEventLike {
  target: { value: string };
}

interface RenderArg {
  getInputProps(options?: Options): Options;
  getSuggestionItemProps(suggestion: Suggestion, options?: Options): Options;
  loading: boolean;
  suggestions: Suggestion[];
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  children: (arg: RenderArg) => React.ReactNode;
  onError: (status: string, clearSuggestions: () => void) => void;
  onSelect?:
    | ((address: string, placeId: string | null, suggestion: Suggestion | null) => void)
    | undefined;
  searchOptions: Options;
  debounce: number;
  highlightFirstSuggestion: boolean;
  shouldFetchSuggestions: boolean;
  googleCallbackName?: string | undefined;
}

interface State {
  loading: boolean;
  suggestions: Suggestion[];
  userInputValue: string;
  ready: boolean;
}

const MAPS_ERROR =
  '[react-places-autocomplete]: Google Maps JavaScript API library must be loaded. See: https://github.com/kenny-hibino/react-places-autocomplete#load-google-library';

const PLACES_ERROR =
  '[react-places-autocomplete]: Google Maps Places library must be loaded. Please add `libraries=places` to the src URL. See: https://github.com/kenny-hibino/react-places-autocomplete#load-google-library';

const SUGGESTION_ID_PREFIX = 'PlacesAutocomplete__suggestion-';

const formattedSuggestion = (
  structured_formatting: google.maps.places.StructuredFormatting,
): Suggestion['formattedSuggestion'] => ({
  mainText: structured_formatting.main_text,
  secondaryText: structured_formatting.secondary_text,
});

function globals(): Record<string, unknown> & { google?: typeof google } {
  return window as unknown as Record<string, unknown> & { google?: typeof google };
}

function hasOwn(object: object, key: string): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is ES2022 and the build targets ES2018.
  return Object.prototype.hasOwnProperty.call(object, key);
}

function placesErrorFor(error: unknown): string {
  return error instanceof PlacesUnavailableError && error.reason === 'no-places'
    ? PLACES_ERROR
    : `${PLACES_ERROR}\n${NEW_API_HINT}`;
}

const propTypes = {
  onChange: PropTypes.func.isRequired,
  value: PropTypes.string.isRequired,
  children: PropTypes.func.isRequired,
  onError: PropTypes.func,
  onSelect: PropTypes.func,
  searchOptions: PropTypes.shape({
    bounds: PropTypes.object,
    componentRestrictions: PropTypes.object,
    location: PropTypes.object,
    offset: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    radius: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    types: PropTypes.array,
  }),
  debounce: PropTypes.number,
  highlightFirstSuggestion: PropTypes.bool,
  shouldFetchSuggestions: PropTypes.bool,
  googleCallbackName: PropTypes.string,
};

const defaultProps = {
  onError: (status: string, _clearSuggestions: () => void) =>
    console.error(
      '[react-places-autocomplete]: error happened when fetching data from Google Maps API.\nPlease check the docs here (https://developers.google.com/maps/documentation/javascript/places#place_details_responses)\nStatus: ',
      status,
    ),
  searchOptions: {},
  debounce: 200,
  highlightFirstSuggestion: false,
  shouldFetchSuggestions: true,
};

class PlacesAutocomplete extends React.Component<Props, State> {
  declare static defaultProps: typeof defaultProps;

  places: google.maps.PlacesLibrary | undefined;
  mousedownOnSuggestion: boolean | undefined;
  debouncedFetchPredictions: (() => void) & { cancel(): void };
  private loadingPlaces = false;
  private searchPending = false;
  private unmounted = false;
  private searchScheduled = false;
  private lateResult: { status: LegacyStatus; predictions: Prediction[] } | undefined;

  constructor(props: Props) {
    super(props);

    this.state = {
      loading: false,
      suggestions: [],
      userInputValue: props.value,
      ready: !props.googleCallbackName,
    };

    this.debouncedFetchPredictions = debounce(this.fetchPredictions, props.debounce);
  }

  override componentDidMount(): void {
    this.unmounted = false;
    const late = this.lateResult;
    if (late) {
      this.lateResult = undefined;
      this.autocompleteCallback(late);
    }
    const { googleCallbackName } = this.props;
    if (googleCallbackName) {
      const { google } = globals();
      const isPlacesLoaded = google?.maps?.places;
      if (!isPlacesLoaded) {
        globals()[googleCallbackName] = this.init;
      } else {
        this.init();
      }
    } else {
      this.init();
    }
    if (this.searchScheduled) {
      this.searchScheduled = false;
      this.fetchPredictions();
    }
  }

  override componentWillUnmount(): void {
    this.unmounted = true;
    this.debouncedFetchPredictions.cancel();
    const { googleCallbackName } = this.props;
    if (googleCallbackName && globals()[googleCallbackName]) {
      delete globals()[googleCallbackName];
    }
  }

  init = (): void => {
    const { google } = globals();
    if (!google) {
      throw new Error(MAPS_ERROR);
    }

    const maps = google.maps;
    const places = getPlaces(maps);
    if (places) {
      this.placesReady(places);
      return;
    }

    if (!maps || typeof maps.importLibrary !== 'function') {
      throw new Error(maps?.places ? `${PLACES_ERROR}\n${NEW_API_HINT}` : PLACES_ERROR);
    }

    if (this.loadingPlaces) return;
    this.loadingPlaces = true;
    loadPlaces(maps).then(
      (loaded) => {
        this.loadingPlaces = false;
        if (!this.unmounted) this.placesReady(loaded);
      },
      (error: unknown) => {
        this.loadingPlaces = false;
        this.searchPending = false;
        if (!this.unmounted) console.error(placesErrorFor(error));
      },
    );
  };

  placesReady = (places: google.maps.PlacesLibrary): void => {
    this.places = places;
    this.setState((state) => {
      if (state.ready) {
        return null;
      } else {
        return { ready: true };
      }
    });
    if (this.searchPending) {
      this.searchPending = false;
      this.fetchPredictions();
    }
  };

  autocompleteCallback = (result: { status: LegacyStatus; predictions: Prediction[] }): void => {
    if (this.unmounted) {
      this.lateResult = result;
      return;
    }
    const { status, predictions } = result;
    this.setState({ loading: false });
    if (status !== 'OK') {
      this.props.onError(status, this.clearSuggestions);
      return;
    }
    const { highlightFirstSuggestion } = this.props;
    this.setState({
      suggestions: predictions.map((p, idx) => ({
        id: undefined,
        description: p.description,
        placeId: p.place_id,
        active: Boolean(highlightFirstSuggestion && idx === 0),
        index: idx,
        formattedSuggestion: formattedSuggestion(p.structured_formatting),
        matchedSubstrings: p.matched_substrings,
        terms: p.terms,
        types: p.types,
      })),
    });
  };

  fetchPredictions = (): void => {
    this.searchScheduled = false;
    const { value } = this.props;
    if (value.length) {
      const places = this.places;
      if (!places) {
        this.searchPending = true;
        return;
      }
      this.setState({ loading: true });
      fetchPlacePredictions(places, {
        ...this.props.searchOptions,
        input: value,
      } as google.maps.places.AutocompletionRequest).then(this.autocompleteCallback);
    }
  };

  clearSuggestions = (): void => {
    this.setState({ suggestions: [] });
  };

  clearActive = (): void => {
    this.setState({
      suggestions: this.state.suggestions.map((suggestion) => ({
        ...suggestion,
        active: false,
      })),
    });
  };

  handleSelect = (address: string, placeId: string | null, suggestion: Suggestion | null): void => {
    this.clearSuggestions();
    if (this.props.onSelect) {
      this.props.onSelect(address, placeId, suggestion);
    } else {
      this.props.onChange(address);
    }
  };

  getActiveSuggestion = (): Suggestion | undefined => {
    return this.state.suggestions.find((suggestion) => suggestion.active);
  };

  selectActiveAtIndex = (index: number): void => {
    const activeName = (
      this.state.suggestions.find((suggestion) => suggestion.index === index) as Suggestion
    ).description;
    this.setActiveAtIndex(index);
    this.props.onChange(activeName);
  };

  selectUserInputValue = (): void => {
    this.clearActive();
    this.props.onChange(this.state.userInputValue);
  };

  handleEnterKey = (): void => {
    const activeSuggestion = this.getActiveSuggestion();
    if (activeSuggestion === undefined) {
      this.handleSelect(this.props.value, null, null);
    } else {
      this.handleSelect(activeSuggestion.description, activeSuggestion.placeId, activeSuggestion);
    }
  };

  handleDownKey = (): void => {
    if (this.state.suggestions.length === 0) {
      return;
    }

    const activeSuggestion = this.getActiveSuggestion();
    if (activeSuggestion === undefined) {
      this.selectActiveAtIndex(0);
    } else if (activeSuggestion.index === this.state.suggestions.length - 1) {
      this.selectUserInputValue();
    } else {
      this.selectActiveAtIndex(activeSuggestion.index + 1);
    }
  };

  handleUpKey = (): void => {
    if (this.state.suggestions.length === 0) {
      return;
    }

    const activeSuggestion = this.getActiveSuggestion();
    if (activeSuggestion === undefined) {
      this.selectActiveAtIndex(this.state.suggestions.length - 1);
    } else if (activeSuggestion.index === 0) {
      this.selectUserInputValue();
    } else {
      this.selectActiveAtIndex(activeSuggestion.index - 1);
    }
  };

  handleInputKeyDown = (event: KeyEventLike): void => {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.handleEnterKey();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.handleDownKey();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.handleUpKey();
        break;
      case 'Escape':
        this.clearSuggestions();
        break;
    }
  };

  setActiveAtIndex = (index: number): void => {
    this.setState({
      suggestions: this.state.suggestions.map((suggestion, idx) => {
        if (idx === index) {
          return { ...suggestion, active: true };
        } else {
          return { ...suggestion, active: false };
        }
      }),
    });
  };

  handleInputChange = (event: ChangeEventLike): void => {
    const { value } = event.target;
    this.props.onChange(value);
    this.setState({ userInputValue: value }, () => {
      if (!value) {
        this.clearSuggestions();
        return;
      }
      if (this.props.shouldFetchSuggestions) {
        this.searchScheduled = true;
        this.debouncedFetchPredictions();
      }
    });
  };

  handleInputOnBlur = (): void => {
    if (!this.mousedownOnSuggestion) {
      this.clearSuggestions();
    }
  };

  getActiveSuggestionId = (): string | undefined => {
    const activeSuggestion = this.getActiveSuggestion();
    return activeSuggestion ? `${SUGGESTION_ID_PREFIX}${activeSuggestion.placeId}` : undefined;
  };

  getIsExpanded = (): boolean => {
    return this.state.suggestions.length > 0;
  };

  getInputProps = (options: Options = {}): Options => {
    if (hasOwn(options, 'value')) {
      throw new Error(
        '[react-places-autocomplete]: getInputProps does not accept `value`. Use `value` prop instead',
      );
    }

    if (hasOwn(options, 'onChange')) {
      throw new Error(
        '[react-places-autocomplete]: getInputProps does not accept `onChange`. Use `onChange` prop instead',
      );
    }

    const defaultInputProps = {
      type: 'text',
      autoComplete: 'off',
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': this.getIsExpanded(),
      'aria-activedescendant': this.getActiveSuggestionId(),
      disabled: !this.state.ready,
    };

    return {
      ...defaultInputProps,
      ...options,
      onKeyDown: compose(this.handleInputKeyDown, options.onKeyDown as UserHandler),
      onBlur: compose(this.handleInputOnBlur, options.onBlur as UserHandler),
      value: this.props.value,
      onChange: (event: ChangeEventLike) => {
        this.handleInputChange(event);
      },
    };
  };

  getSuggestionItemProps = (suggestion: Suggestion, options: Options = {}): Options => {
    const handleSuggestionMouseEnter = () => this.handleSuggestionMouseEnter(suggestion.index);
    const handleSuggestionClick = (event?: { preventDefault?: () => void }) =>
      this.handleSuggestionClick(suggestion, event);

    return {
      ...options,
      key: suggestion.placeId,
      id: `${SUGGESTION_ID_PREFIX}${suggestion.placeId}`,
      role: 'option',
      onMouseEnter: compose(handleSuggestionMouseEnter, options.onMouseEnter as UserHandler),
      onMouseLeave: compose(this.handleSuggestionMouseLeave, options.onMouseLeave as UserHandler),
      onMouseDown: compose(this.handleSuggestionMouseDown, options.onMouseDown as UserHandler),
      onMouseUp: compose(this.handleSuggestionMouseUp, options.onMouseUp as UserHandler),
      onTouchStart: compose(this.handleSuggestionTouchStart, options.onTouchStart as UserHandler),
      onTouchEnd: compose(this.handleSuggestionMouseUp, options.onTouchEnd as UserHandler),
      onClick: compose(handleSuggestionClick, options.onClick as UserHandler),
    };
  };

  handleSuggestionMouseEnter = (index: number): void => {
    this.setActiveAtIndex(index);
  };

  handleSuggestionMouseLeave = (): void => {
    this.mousedownOnSuggestion = false;
    this.clearActive();
  };

  handleSuggestionMouseDown = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    this.mousedownOnSuggestion = true;
  };

  handleSuggestionTouchStart = (): void => {
    this.mousedownOnSuggestion = true;
  };

  handleSuggestionMouseUp = (): void => {
    this.mousedownOnSuggestion = false;
  };

  handleSuggestionClick = (
    suggestion: Suggestion,
    event?: { preventDefault?: (() => void) | undefined },
  ): void => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    const { description, placeId } = suggestion;
    this.handleSelect(description, placeId, suggestion);
    setTimeout(() => {
      this.mousedownOnSuggestion = false;
    });
  };

  override render(): React.ReactNode {
    return this.props.children({
      getInputProps: this.getInputProps,
      getSuggestionItemProps: this.getSuggestionItemProps,
      loading: this.state.loading,
      suggestions: this.state.suggestions,
    });
  }
}

Object.assign(PlacesAutocomplete, { propTypes, defaultProps });

export default PlacesAutocomplete;
