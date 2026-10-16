/** #810: refuse Express query arrays/objects and tenant override keys on guardian grants. */
export function vetGuardianGrantsPatientId(query: unknown): string {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  const values = query as Record<string, unknown>;
  if (Object.keys(values).length !== 1 || !Object.prototype.hasOwnProperty.call(values, 'patientId')) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  const id = values.patientId;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  return id;
}
