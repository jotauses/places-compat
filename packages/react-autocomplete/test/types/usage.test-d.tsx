import { expectTypeOf } from 'expect-type';
import * as React from 'react';
import ReactGoogleAutocomplete, { usePlacesWidget } from '../../src';
import usePlacesAutocompleteService from '../../src/usePlacesAutocompleteService';

const inputRef = React.createRef<HTMLInputElement>();

export const element = (
  <ReactGoogleAutocomplete
    apiKey="test-key"
    className="field"
    defaultValue="Paris"
    language="fr"
    libraries={['places']}
    options={{ types: ['(regions)'], componentRestrictions: { country: 'fr' } }}
    onPlaceSelected={(place, input, autocomplete) => {
      expectTypeOf(place).toEqualTypeOf<google.maps.places.PlaceResult>();
      expectTypeOf(input).toEqualTypeOf<React.RefObject<HTMLInputElement>>();
      expectTypeOf(autocomplete).toEqualTypeOf<React.RefObject<google.maps.places.Autocomplete>>();
    }}
    ref={inputRef}
  />
);

export function WidgetInput(): React.ReactElement {
  const { ref, autocompleteRef } = usePlacesWidget<HTMLInputElement>({
    apiKey: 'test-key',
    onPlaceSelected: () => undefined,
  });
  expectTypeOf(ref).toEqualTypeOf<React.RefObject<HTMLInputElement>>();
  expectTypeOf(autocompleteRef).toEqualTypeOf<React.RefObject<google.maps.places.Autocomplete>>();
  return <input ref={ref} />;
}

export function ServiceList(): React.ReactElement {
  const { placePredictions, getPlacePredictions } = usePlacesAutocompleteService({
    apiKey: 'test-key',
    debounce: 500,
  });
  getPlacePredictions({ input: 'Par' });
  return (
    <ul>
      {placePredictions.map((prediction) => (
        <li key={prediction.place_id}>{prediction.description}</li>
      ))}
    </ul>
  );
}

expectTypeOf(usePlacesWidget).returns.toHaveProperty('ref');
expectTypeOf(usePlacesAutocompleteService).returns.toHaveProperty('refreshSessionToken');
