import PropTypes from 'prop-types';
import * as React from 'react';
import type { ReactGoogleAutocompleteComponent, ReactGoogleAutocompleteProps } from './types';
import usePlacesWidget from './usePlacesWidget';

export type { ReactGoogleAutocompleteInputProps, ReactGoogleAutocompleteProps } from './types';
export { usePlacesWidget };

type ComponentProps = ReactGoogleAutocompleteProps &
  Record<string, unknown> & { refProp?: React.ForwardedRef<HTMLInputElement> };

function ReactGoogleAutocomplete(props: ComponentProps): React.ReactElement {
  const {
    onPlaceSelected,
    apiKey,
    libraries,
    inputAutocompleteValue,
    options,
    googleMapsScriptBaseUrl,
    refProp,
    language,
    ...rest
  } = props;

  const { ref } = usePlacesWidget<HTMLInputElement>({
    ref: refProp,
    googleMapsScriptBaseUrl,
    onPlaceSelected,
    apiKey,
    libraries,
    inputAutocompleteValue,
    options,
    language,
  } as ReactGoogleAutocompleteProps);

  return React.createElement('input', { ref, ...rest });
}

(ReactGoogleAutocomplete as { propTypes?: object }).propTypes = {
  apiKey: PropTypes.string,
  libraries: PropTypes.arrayOf(PropTypes.string),
  ref: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
  googleMapsScriptBaseUrl: PropTypes.string,
  onPlaceSelected: PropTypes.func,
  inputAutocompleteValue: PropTypes.string,
  options: PropTypes.shape({
    componentRestrictions: PropTypes.object,
    bounds: PropTypes.object,
    location: PropTypes.object,
    offset: PropTypes.number,
    origin: PropTypes.object,
    radius: PropTypes.number,
    sessionToken: PropTypes.object,
    types: PropTypes.arrayOf(PropTypes.string),
  }),
  language: PropTypes.string,
};

export default React.forwardRef<HTMLInputElement, ComponentProps>((props, ref) =>
  React.createElement(ReactGoogleAutocomplete, { ...props, refProp: ref }),
) as unknown as ReactGoogleAutocompleteComponent;
