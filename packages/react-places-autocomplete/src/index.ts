import type * as React from 'react';
import Implementation from './PlacesAutocomplete';
import type { PropTypes } from './types';

declare class PlacesAutocompleteComponent extends React.Component<PropTypes> {}

const PlacesAutocompleteExport = Implementation as unknown as typeof PlacesAutocompleteComponent;
type PlacesAutocompleteExport = PlacesAutocompleteComponent;

export default PlacesAutocompleteExport;
export { geocodeByAddress, geocodeByPlaceId, getLatLng } from './geocode';
export type { AutocompletePrediction, PropTypes, Suggestion } from './types';
