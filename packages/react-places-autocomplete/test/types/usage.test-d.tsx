import { expectTypeOf } from 'expect-type';
import * as React from 'react';
import PlacesAutocomplete, { type PropTypes, type Suggestion } from '../../src';

const children: PropTypes['children'] = ({
  getInputProps,
  getSuggestionItemProps,
  suggestions,
}) => {
  const inputProps = getInputProps({ placeholder: 'Search places', className: 'search' });
  expectTypeOf(inputProps.placeholder).toEqualTypeOf<string>();
  expectTypeOf(inputProps.value).toEqualTypeOf<string | undefined>();
  return (
    <div>
      <input {...inputProps} />
      {suggestions.map((suggestion: Suggestion) => {
        const itemProps = getSuggestionItemProps(suggestion, { className: 'item' });
        expectTypeOf(itemProps.key).toEqualTypeOf<number>();
        return (
          <div {...itemProps} key={suggestion.placeId}>
            {suggestion.description}
          </div>
        );
      })}
    </div>
  );
};

expectTypeOf(PlacesAutocomplete).toBeConstructibleWith({ children });
// @ts-expect-error children is required
new PlacesAutocomplete({});

const ref = React.createRef<PlacesAutocomplete>();
expectTypeOf(ref.current).toEqualTypeOf<PlacesAutocomplete | null>();

const element = (
  <PlacesAutocomplete
    ref={ref}
    value="San Francisco"
    onChange={(value) => expectTypeOf(value).toEqualTypeOf<string>()}
    onSelect={(address, placeId) => {
      expectTypeOf(address).toEqualTypeOf<string>();
      expectTypeOf(placeId).toEqualTypeOf<string>();
    }}
    searchOptions={{ types: ['geocode'] }}
  >
    {children}
  </PlacesAutocomplete>
);
expectTypeOf(element).toExtend<React.ReactElement>();

const minimal = <PlacesAutocomplete>{() => null}</PlacesAutocomplete>;
expectTypeOf(minimal).toExtend<React.ReactElement>();
