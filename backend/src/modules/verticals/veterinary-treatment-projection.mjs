/**
 * #816: treatment retry metadata is an internal deduplication contract, not
 * part of the clinical record exposed to the UI. Keep the stored JSON intact
 * so a replay can be resolved after discharge.
 */
export function publicVeterinaryTreatmentValues(raw){
  const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?{...raw}:{};
  delete value.treatmentRequestKey;
  delete value.treatmentRequestFingerprint;
  return value;
}
