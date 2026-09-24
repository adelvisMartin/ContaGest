import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AUTOMATION_STATES, type AutomationState } from './agent-contracts.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^[A-Za-z0-9._:-]{3,120}$/;
const GROUP_ID_RE = /^[A-Za-z0-9@._:-]{3,220}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;
const SHADOW_INDEX = AUTOMATION_STATES.indexOf('SHADOW');

export type AutomationDbClient = typeof prisma | Prisma.TransactionClient;
export type AutomationScope = { ownerId: string; groupKey: string; groupId: string };

export function assertAutomationScope(ownerId: string, groupKey: string, groupId: string) {
  if (!UUID_RE.test(ownerId)) throw new Error('HIPICO_OWNER_INVALID');
  if (!GROUP_RE.test(groupKey)) throw new Error('HIPICO_GROUP_INVALID');
  if (!GROUP_ID_RE.test(groupId)) throw new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID');
}

export function validatedAutomationScope(input: AutomationScope): AutomationScope {
  assertAutomationScope(input.ownerId, input.groupKey, input.groupId);
  return input;
}

export function isPinnedSourceGroup(groupId: string) {
  const configured = String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim();
  return Boolean(configured) && configured.toLowerCase() === String(groupId || '').trim().toLowerCase();
}

export function defaultAutomationMode(groupId: string): AutomationState {
  return isPinnedSourceGroup(groupId) ? 'SHADOW' : 'DISABLED';
}

export function sourceMayTargetAutomation(groupId: string, target: AutomationState) {
  if (!isPinnedSourceGroup(groupId)) return true;
  return AUTOMATION_STATES.indexOf(target) <= SHADOW_INDEX;
}

export function automationScopeLockKey(ownerId: string, groupKey: string, groupId: string) {
  return `hipico-agent:${ownerId}:${groupKey}:${groupId}`;
}

export async function lockAutomationScope(db: AutomationDbClient, ownerId: string, groupKey: string, groupId: string) {
  const key = automationScopeLockKey(ownerId, groupKey, groupId);
  // pg_advisory_xact_lock returns PostgreSQL `void`. Prisma 6 cannot deserialize
  // a top-level void column, so keep the lock side effect inside a materialized
  // CTE and return a supported boolean scalar to the client.
  await db.$queryRaw`WITH acquired AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
  ) SELECT true AS "locked" FROM acquired`;
}

export function isValidAutomationIdempotencyKey(value: unknown) {
  return IDEMPOTENCY_RE.test(String(value || '').trim());
}

export const __test__ = { UUID_RE, GROUP_RE, GROUP_ID_RE, IDEMPOTENCY_RE, SHADOW_INDEX };
