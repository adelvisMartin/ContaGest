import { BackendApi } from './backendApi.js';

export function buildGoogleMapsSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
}

export function buildGoogleMapsDirectionsUrl(origin, destination) {
  const destinationQuery = encodeURIComponent(destination || '');
  const originQuery = origin ? `&origin=${encodeURIComponent(origin)}` : '';
  return `https://www.google.com/maps/dir/?api=1${originQuery}&destination=${destinationQuery}`;
}

export const MapsService = {
  async geocode(address) {
    const fallback = {
      ok: false,
      provider: 'fallback',
      address,
      mapUrl: buildGoogleMapsSearchUrl(address),
      directionsUrl: buildGoogleMapsDirectionsUrl('', address)
    };
    if (!address) return fallback;
    try {
      const result = await BackendApi.post('/api/v1/maps/geocode', { address });
      return { ...fallback, ...result?.data, ok: true };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  },
  mapUrl: buildGoogleMapsSearchUrl,
  directionsUrl: buildGoogleMapsDirectionsUrl
};
