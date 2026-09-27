import type { Response } from 'express';

export const API_MAJOR_VERSION = 'v1' as const;
export const API_BASE_PATH = `/api/${API_MAJOR_VERSION}` as const;

export const HTTP_CONTRACT = Object.freeze({
  errorEnvelope: ['ok', 'message', 'requestId'] as const,
  pagination: Object.freeze({ defaultTake: 100, maxTake: 500, maxSkip: 1_000_000 }),
  idempotencyHeader: 'Idempotency-Key',
  correlationHeader: 'X-Request-Id',
});

export function setLegacyApiDeprecationHeaders(
  res: Response,
  input: { successorPath: string; sunset?: string | null },
) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', `<${input.successorPath}>; rel="successor-version"`);
  if (input.sunset) {
    const timestamp = Date.parse(input.sunset);
    if (Number.isFinite(timestamp)) res.setHeader('Sunset', new Date(timestamp).toUTCString());
  }
}
