// @ts-nocheck
import { renderCompat as render } from '@places-compat/core/testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import PlacesAutocomplete, { geocodeByAddress, geocodeByPlaceId, getLatLng } from '../src';

function LocationSearchInput() {
  const [address, setAddress] = useState('');

  const handleSelect = (selected) => {
    setAddress(selected);
    geocodeByAddress(selected)
      .then((results) => getLatLng(results[0]))
      .then((latLng) => console.log('Success', latLng))
      .catch((error) => console.error('Error', error));
  };

  return (
    <PlacesAutocomplete value={address} onChange={setAddress} onSelect={handleSelect}>
      {({ getInputProps, suggestions, getSuggestionItemProps, loading }) => (
        <div>
          <input {...getInputProps({ placeholder: 'Search Places ...' })} />
          <div>
            {loading && <div>Loading...</div>}
            {suggestions.map((suggestion) => {
              const { key, ...itemProps } = getSuggestionItemProps(suggestion, {
                className: suggestion.active ? 'suggestion-item--active' : 'suggestion-item',
              });
              return (
                <div key={key} {...itemProps}>
                  {suggestion.description}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PlacesAutocomplete>
  );
}

const PLACES = [
  {
    placeId: 'fake-place-san-francisco',
    mainText: 'San Francisco',
    secondaryText: 'CA, USA',
    location: { lat: 37.7749295, lng: -122.4194155 },
  },
  {
    placeId: 'fake-place-san-jose',
    mainText: 'San Jose',
    secondaryText: 'CA, USA',
    location: { lat: 37.3382082, lng: -121.8863286 },
  },
];

const fullText = (place) => `${place.mainText}, ${place.secondaryText}`;

function toSuggestion(place, input) {
  const match = { startOffset: 0, endOffset: input.length };
  return {
    placePrediction: {
      placeId: place.placeId,
      text: { text: fullText(place), matches: [match] },
      mainText: { text: place.mainText, matches: [match] },
      secondaryText: { text: place.secondaryText, matches: [] },
      types: ['locality', 'political', 'geocode'],
      distanceMeters: null,
    },
  };
}

function installFakeGoogle() {
  window.google = {
    maps: {
      places: {
        AutocompleteSuggestion: {
          async fetchAutocompleteSuggestions(request) {
            const input = request.input.toLowerCase();
            const found = PLACES.filter((place) => fullText(place).toLowerCase().startsWith(input));
            return { suggestions: found.map((place) => toSuggestion(place, request.input)) };
          },
        },
      },
      GeocoderStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      Geocoder: class {
        geocode(request, callback) {
          const place = PLACES.find(
            (p) => p.placeId === request.placeId || fullText(p) === request.address,
          );
          if (!place) {
            callback(null, 'ZERO_RESULTS');
            return;
          }
          const { lat, lng } = place.location;
          callback(
            [
              {
                place_id: place.placeId,
                formatted_address: fullText(place),
                geometry: { location: { lat: () => lat, lng: () => lng } },
              },
            ],
            'OK',
          );
        }
      },
    },
  };
}

beforeEach(() => installFakeGoogle());
afterEach(() => {
  delete window.google;
});

test('shows suggestions from the fake', async () => {
  render(<LocationSearchInput />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'San' } });
  expect(await screen.findByText('San Francisco, CA, USA')).toBeTruthy();
});

test('narrows the suggestions to the typed text', async () => {
  render(<LocationSearchInput />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'San J' } });
  expect(await screen.findByText('San Jose, CA, USA')).toBeTruthy();
  expect(screen.queryByText('San Francisco, CA, USA')).toBeNull();
});

test('selects a suggestion and geocodes it through the fake', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    render(<LocationSearchInput />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'San' } });
    fireEvent.click(await screen.findByText('San Francisco, CA, USA'));
    expect(screen.getByRole('combobox').value).toBe('San Francisco, CA, USA');
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith('Success', { lat: 37.7749295, lng: -122.4194155 }),
    );
  } finally {
    log.mockRestore();
  }
});

test('serves the geocode helpers', async () => {
  const [result] = await geocodeByPlaceId('fake-place-san-jose');
  expect(await getLatLng(result)).toEqual({ lat: 37.3382082, lng: -121.8863286 });
  await expect(geocodeByAddress('Nowhere')).rejects.toBe('ZERO_RESULTS');
});
