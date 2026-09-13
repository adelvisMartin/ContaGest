import { RUNTIME_MODES } from './runtime-config.mjs';
import { sourceTitleMatches } from './runtime-utils.mjs';

export function assessRuntimeReadiness({
  runtimeMode,
  backendState,
  activeSourceTitle,
  sourceMatches,
  eventSpool = 0,
  mirrorSpool = 0,
  deadLetters = 0,
  documentSpool = 0,
  documentQuarantine = 0
}) {
  const reasons = [];
  const production = runtimeMode === RUNTIME_MODES.PRODUCTION;
  if (!sourceTitleMatches(activeSourceTitle, sourceMatches)) reasons.push('SOURCE_NOT_ACTIVE');
  if (production && backendState !== 'online') reasons.push(`BACKEND_${String(backendState || 'unknown').toUpperCase()}`);
  if (eventSpool > 0) reasons.push('EVENT_SPOOL_PENDING');
  if (mirrorSpool > 0) reasons.push('LAB_MIRROR_PENDING');
  if (deadLetters > 0) reasons.push('DEAD_LETTERS_PRESENT');
  if (documentSpool > 0) reasons.push('DOCUMENT_SPOOL_PENDING');
  if (documentQuarantine > 0) reasons.push('DOCUMENT_QUARANTINE_PRESENT');
  if (!production) reasons.push('LOCAL_SHADOW_MODE');
  const blocked=deadLetters>0||documentQuarantine>0;
  return {
    ready: reasons.length === 0,
    state: reasons.length === 0 ? 'ready' : (blocked ? 'blocked' : 'degraded'),
    reasons
  };
}