/**
 * #849: pure validation of an ordered service-step definition, without any
 * database write, availability allocation, pricing, entitlement or clinical
 * execution authority. Only the Service Catalog's authorized server adapter
 * may supply tenant-scoped IDs; this is NOT a request-body authorization gate.
 */
export type ServiceCatalogStepInput = Readonly<{
  tenantId: string;
  serviceId: string;
  id: string;
  position: number;
  label: string;
  durationMinutes: number;
  gapAfterMinutes: number;
}>;

export type ServiceStepPlanInput = Readonly<{
  tenantId: string;
  serviceId: string;
  version: number;
  steps: readonly ServiceCatalogStepInput[];
}>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STEP_KEYS = new Set([
  'tenantId', 'serviceId', 'id', 'position', 'label',
  'durationMinutes', 'gapAfterMinutes',
]);
const PLAN_KEYS = new Set(['tenantId', 'serviceId', 'version', 'steps']);
const denied = (): never => { throw new Error('SERVICE_CATALOG_STEP_PLAN_INVALID'); };
const validId = (value: unknown): value is string =>
  typeof value === 'string' && IDENTIFIER.test(value);
const positive = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
const nonnegative = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const plainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const knownFields = (value: Record<string, unknown>, keys: Set<string>): boolean =>
  Object.keys(value).every(key => keys.has(key));

/** Deterministic, immutable preview. Historical bookings need a persisted snapshot elsewhere. */
export function buildServiceStepPlan(input: ServiceStepPlanInput) {
  if (!plainRecord(input) || !knownFields(input, PLAN_KEYS) ||
      !validId(input.tenantId) || !validId(input.serviceId) ||
      !positive(input.version, Number.MAX_SAFE_INTEGER) ||
      !Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 24) denied();

  // Array.map skips holes: an incomplete server snapshot must never yield a valid plan.
  if (Array.from({ length: input.steps.length }, (_, index) => index)
    .some(index => !Object.hasOwn(input.steps, index))) denied();

  const ids = new Set<string>();
  const positions = new Set<number>();
  const steps = input.steps.map(step => {
    if (!plainRecord(step) || !knownFields(step, STEP_KEYS) ||
        step.tenantId !== input.tenantId || step.serviceId !== input.serviceId ||
        !validId(step.id) || !positive(step.position, input.steps.length) ||
        typeof step.label !== 'string' || step.label !== step.label.trim() ||
        step.label.length < 1 || step.label.length > 120 ||
        !positive(step.durationMinutes, 480) || !nonnegative(step.gapAfterMinutes, 180) ||
        ids.has(step.id) || positions.has(step.position)) denied();
    ids.add(step.id);
    positions.add(step.position);
    return Object.freeze({
      tenantId: step.tenantId, serviceId: step.serviceId,
      id: step.id, position: step.position, label: step.label,
      durationMinutes: step.durationMinutes, gapAfterMinutes: step.gapAfterMinutes,
    });
  }).sort((a, b) => a.position - b.position);

  if (steps.some((step, index) => step.position !== index + 1) ||
      steps[steps.length - 1].gapAfterMinutes !== 0) denied();
  const durationMinutes = steps.reduce((sum, step) => sum + step.durationMinutes, 0);
  const totalMinutes = steps.reduce((sum, step) => sum + step.durationMinutes + step.gapAfterMinutes, 0);
  if (totalMinutes > 2880) denied();
  return Object.freeze({
    tenantId: input.tenantId, serviceId: input.serviceId, version: input.version,
    durationMinutes, totalMinutes, steps: Object.freeze(steps), previewOnly: true as const,
  });
}
