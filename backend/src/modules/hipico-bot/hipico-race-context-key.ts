import {
  normalizedRaceDate,
  normalizedRaceTrack,
  operationalRaceContextKey
} from '../hipico/hipico-domain.js';

export { operationalRaceContextKey };

// Compatibility-only test surface. Deterministic normalization is implemented
// once in the canonical domain module above.
export const __test__ = {
  normalizedTrack: normalizedRaceTrack,
  normalizedRaceDate
};
