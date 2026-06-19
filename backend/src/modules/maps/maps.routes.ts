import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const schema = z.object({ address: z.string().min(3), provider: z.enum(['google','mapbox']).optional() });

function googleMapUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

async function geocodeGoogle(address: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const response = await fetch(url);
  const data = await response.json();
  const first = data.results?.[0];
  if (!first) return null;
  return { provider: 'google', formattedAddress: first.formatted_address, location: first.geometry?.location, placeId: first.place_id };
}

async function geocodeMapbox(address: string) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(address)}&access_token=${token}`;
  const response = await fetch(url);
  const data = await response.json();
  const first = data.features?.[0];
  if (!first) return null;
  return { provider: 'mapbox', formattedAddress: first.properties?.full_address || first.properties?.name, location: { lng: first.geometry?.coordinates?.[0], lat: first.geometry?.coordinates?.[1] }, placeId: first.id };
}

router.post('/geocode', asyncHandler(async (req, res) => {
  const body = schema.parse(req.body || {});
  const result = body.provider === 'mapbox'
    ? await geocodeMapbox(body.address) || await geocodeGoogle(body.address)
    : await geocodeGoogle(body.address) || await geocodeMapbox(body.address);
  ok(res, {
    address: body.address,
    mapUrl: googleMapUrl(body.address),
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(body.address)}`,
    ...(result || { provider: 'fallback', formattedAddress: body.address, location: null })
  });
}));

export default router;
