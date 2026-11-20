/** #810: refuse Express query arrays/objects and tenant override keys on guardian grants. */
export function vetGuardianGrantsPatientId(query: unknown): string {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  // Express parses external query parameters into objects. Do not trust
  // inherited keys, Symbols, non-enumerable payloads or user-defined getters:
  // all of them can hide a tenant override from Object.keys().
  const prototype = Object.getPrototypeOf(query);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  const keys = Reflect.ownKeys(query);
  const property = Object.getOwnPropertyDescriptor(query, 'patientId');
  if (keys.length !== 1 || keys[0] !== 'patientId' ||
      !property || !Object.hasOwn(property, 'value')) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  const id = property.value;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('VET_GUARDIAN_QUERY_INVALID');
  }
  return id;
}
