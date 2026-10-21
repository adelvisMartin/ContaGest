/**
 * Strict, model-bound policy for the five legacy CRUD factory consumers.
 * Financial state (balances, stock and tax-period posting) belongs to domain
 * services, never to generic create/update/delete from a browser payload.
 *
 * This module deliberately has no Prisma, Express or Zod dependencies so that
 * fail-closed cases can be verified using a bare Node 22 runtime.
 */

const MUTABLE_FIELDS = {
  client: {
    create: ['rif', 'name', 'contact', 'email', 'phone', 'address', 'fiscalType', 'active'],
    update: ['name', 'contact', 'email', 'phone', 'address', 'fiscalType', 'active']
  },
  supplier: {
    create: ['rif', 'name', 'contact', 'email', 'phone', 'address', 'retentionProfile', 'active'],
    update: ['name', 'contact', 'email', 'phone', 'address', 'retentionProfile', 'active']
  },
  product: {
    create: ['sku', 'name', 'description', 'unit', 'cost', 'price', 'minStock', 'taxRate', 'active'],
    update: ['sku', 'name', 'description', 'unit', 'cost', 'price', 'minStock', 'taxRate', 'active']
  },
  bankAccount: {
    create: ['bankName', 'accountNo', 'currency', 'active'],
    update: ['bankName', 'active']
  },
  taxPeriod: {
    create: ['period'],
    update: []
  }
} as const;

export type CrudModel = keyof typeof MUTABLE_FIELDS;
export type CrudMutation = 'create' | 'update' | 'delete';

// Bind each generic Prisma model to exactly one business permission and audit
// entity. A future route must not expose a financial model under a weaker role.
export const CRUD_ROUTER_AUTHORITY = Object.freeze({
  client: { entity: 'client', permission: 'clients.manage' },
  supplier: { entity: 'supplier', permission: 'purchases.manage' },
  product: { entity: 'product', permission: 'inventory.manage' },
  bankAccount: { entity: 'bankAccount', permission: 'banking.manage' },
  taxPeriod: { entity: 'taxPeriod', permission: 'taxes.export' }
} as const satisfies Record<CrudModel, Readonly<{ entity: string; permission: string }>>);


export const CRUD_SEARCH_FIELDS: Readonly<Record<CrudModel, readonly string[]>> = Object.freeze({
  client: ['name', 'rif'],
  supplier: ['name', 'rif'],
  product: ['name', 'sku'],
  bankAccount: ['bankName', 'accountNo'],
  taxPeriod: ['period']
});

const LIST_QUERY_FIELDS = new Set(['take', 'skip', 'q']);
const NON_DELETABLE_MODELS = new Set<CrudModel>(['bankAccount', 'taxPeriod']);

export class CrudPolicyError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'CrudPolicyError';
    this.status = status;
  }
}

export function assertCrudRouterAuthority(model: CrudModel, entity: string, permission: string): void {
  // This check applies even to untyped JavaScript callers and stale manifests.
  // Own-property lookup prevents inherited Object keys from being treated as
  // allowed models. Never echo the rejected permission/entity to an API user.
  if (!Object.prototype.hasOwnProperty.call(CRUD_ROUTER_AUTHORITY, model)) {
    throw new CrudPolicyError('Modelo CRUD no autorizado.');
  }
  const expected = CRUD_ROUTER_AUTHORITY[model];
  if (entity !== expected.entity || permission !== expected.permission) {
    throw new CrudPolicyError('Autoridad de ruta CRUD no permitida.');
  }
}

export function parseCrudRouteId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CrudPolicyError('Identificador de ruta inválido.');
  }
  return value;
}

export function assertCrudOperation(model: CrudModel, operation: CrudMutation): void {
  // External JS callers do not receive TypeScript's static model/operation checks.
  if (!Object.prototype.hasOwnProperty.call(MUTABLE_FIELDS, model) ||
      !['create', 'update', 'delete'].includes(operation)) {
    throw new CrudPolicyError('Operación de catálogo no permitida.');
  }
  if (operation === 'delete' && NON_DELETABLE_MODELS.has(model)) {
    throw new CrudPolicyError('La eliminación requiere un servicio de dominio autorizado.', 405);
  }
  if (operation === 'update' && model === 'taxPeriod') {
    throw new CrudPolicyError('El período fiscal sólo se modifica mediante el servicio fiscal.', 405);
  }
}

export function assertCrudMutationFields(
  model: CrudModel,
  operation: Extract<CrudMutation, 'create' | 'update'>,
  payload: unknown
): void {
  assertCrudOperation(model, operation);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new CrudPolicyError('El cuerpo debe ser un objeto JSON.');
  }

  const allowed = new Set<string>(MUTABLE_FIELDS[model][operation]);
  const unrecognized = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unrecognized.length > 0) {
    // Do not echo arbitrary attacker-controlled keys into API errors/logs.
    throw new CrudPolicyError('El cuerpo contiene campos no permitidos.');
  }
  if (operation === 'update' && Object.keys(payload).length === 0) {
    throw new CrudPolicyError('La actualización requiere al menos un campo.');
  }
}

const DEFAULT_LIST_TAKE = 100;
const MAX_LIST_TAKE = 500;
const MAX_LIST_SKIP = 1_000_000;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new CrudPolicyError('Parámetros de paginación inválidos.');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function parseCrudListWindow(query: Record<string, unknown>): { take: number; skip: number } {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new CrudPolicyError('Parámetros de consulta inválidos.');
  }
  for (const key of Object.keys(query)) {
    if (!LIST_QUERY_FIELDS.has(key)) throw new CrudPolicyError('Filtro u orden no permitido.');
  }
  return {
    take: boundedInteger(query.take, DEFAULT_LIST_TAKE, 1, MAX_LIST_TAKE),
    skip: boundedInteger(query.skip, 0, 0, MAX_LIST_SKIP)
  };
}

export function parseCrudSearchText(query: Record<string, unknown>): string {
  if (query.q === undefined) return '';
  if (typeof query.q !== 'string') throw new CrudPolicyError('Búsqueda inválida.');
  const text = query.q.trim();
  if (text.length > 160 || /[\u0000-\u001F\u007F]/.test(text)) {
    throw new CrudPolicyError('Búsqueda inválida.');
  }
  return text;
}
