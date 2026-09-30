import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

export const DOCUMENT_SEQUENCE_DEFAULT_PERIOD_KEY = '';
export const SALES_INVOICE_SEQUENCE_KEY = 'sales.invoice';
export const PURCHASE_INVOICE_SEQUENCE_KEY = 'purchase.invoice';

const DEFAULT_PADDING = 6;
const MIN_PADDING = 1;
const MAX_PADDING = 18;
const MAX_KEY_LENGTH = 80;
const MAX_PERIOD_KEY_LENGTH = 40;
const MAX_AFFIX_LENGTH = 64;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const PERIOD_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

type SequenceRow = {
  tenantId: string;
  key: string;
  periodKey: string;
  prefix: string;
  suffix: string;
  padding: number;
  currentValue: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentSequenceSettings = {
  prefix: string;
  suffix: string;
  padding: number;
};

export type DocumentSequenceView = {
  tenantId: string;
  key: string;
  periodKey: string;
  prefix: string;
  suffix: string;
  padding: number;
  currentValue: string;
  createdAt: Date;
  updatedAt: Date;
};

function validationError(message: string, code: string) {
  return new HttpError(422, message, { code });
}

export function normalizeDocumentSequenceKey(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(normalized)) {
    throw validationError('La clave de secuencia documental es inválida.', 'DOCUMENT_SEQUENCE_KEY_INVALID');
  }
  return normalized;
}

export function normalizeDocumentSequencePeriodKey(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return DOCUMENT_SEQUENCE_DEFAULT_PERIOD_KEY;
  if (normalized.length > MAX_PERIOD_KEY_LENGTH || !PERIOD_PATTERN.test(normalized)) {
    throw validationError('La clave de período de la secuencia documental es inválida.', 'DOCUMENT_SEQUENCE_PERIOD_INVALID');
  }
  return normalized;
}

function normalizeAffix(value: unknown, label: 'prefijo' | 'sufijo') {
  const normalized = String(value ?? '');
  if (normalized.length > MAX_AFFIX_LENGTH) {
    throw validationError(`El ${label} de la secuencia documental excede ${MAX_AFFIX_LENGTH} caracteres.`, 'DOCUMENT_SEQUENCE_AFFIX_INVALID');
  }
  return normalized;
}

export function normalizeDocumentSequenceSettings(input: Partial<DocumentSequenceSettings> = {}): DocumentSequenceSettings {
  const padding = input.padding ?? DEFAULT_PADDING;
  if (!Number.isInteger(padding) || padding < MIN_PADDING || padding > MAX_PADDING) {
    throw validationError(`padding debe ser un entero entre ${MIN_PADDING} y ${MAX_PADDING}.`, 'DOCUMENT_SEQUENCE_PADDING_INVALID');
  }
  return {
    prefix: normalizeAffix(input.prefix, 'prefijo'),
    suffix: normalizeAffix(input.suffix, 'sufijo'),
    padding
  };
}

export function documentSequenceMaxValue(padding: number) {
  const { padding: normalizedPadding } = normalizeDocumentSequenceSettings({ padding });
  return (10n ** BigInt(normalizedPadding)) - 1n;
}

export function normalizeDocumentSequencePosition(value: string | number | bigint, padding: number) {
  let position: bigint;
  try {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new Error('unsafe number');
      position = BigInt(value);
    } else {
      const raw = String(value).trim();
      if (!/^\d+$/.test(raw)) throw new Error('invalid integer');
      position = BigInt(raw);
    }
  } catch {
    throw validationError('La posición actual de la secuencia debe ser un entero no negativo exacto.', 'DOCUMENT_SEQUENCE_POSITION_INVALID');
  }
  if (position < 0n || position > documentSequenceMaxValue(padding)) {
    throw validationError('La posición actual excede la capacidad configurada de la secuencia.', 'DOCUMENT_SEQUENCE_POSITION_INVALID');
  }
  return position;
}

export function formatDocumentSequenceNumber(input: DocumentSequenceSettings & { value: bigint }) {
  const settings = normalizeDocumentSequenceSettings(input);
  if (input.value <= 0n || input.value > documentSequenceMaxValue(settings.padding)) {
    throw new HttpError(409, 'La secuencia documental agotó su capacidad configurada.', { code: 'DOCUMENT_SEQUENCE_EXHAUSTED' });
  }
  return `${settings.prefix}${input.value.toString().padStart(settings.padding, '0')}${settings.suffix}`;
}

function serializeRow(row: SequenceRow): DocumentSequenceView {
  return {
    tenantId: row.tenantId,
    key: row.key,
    periodKey: row.periodKey,
    prefix: row.prefix,
    suffix: row.suffix,
    padding: row.padding,
    currentValue: row.currentValue.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function lockIdentity(tenantId: string, key: string, periodKey: string) {
  return `document-sequence:${tenantId}:${key}:${periodKey}`;
}

async function lockSequence(tx: Prisma.TransactionClient, tenantId: string, key: string, periodKey: string) {
  const identity = lockIdentity(tenantId, key, periodKey);
  await tx.$queryRaw<Array<{ locked: string | null }>>`
    SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))::text AS locked
  `;
}

export async function allocateDocumentNumber(
  input: {
    tenantId: string;
    key: string;
    periodKey?: string | null;
    defaults?: Partial<DocumentSequenceSettings>;
  },
  tx: Prisma.TransactionClient
) {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) throw validationError('tenantId es obligatorio para asignar una secuencia documental.', 'DOCUMENT_SEQUENCE_TENANT_REQUIRED');
  const key = normalizeDocumentSequenceKey(input.key);
  const periodKey = normalizeDocumentSequencePeriodKey(input.periodKey);
  const defaults = normalizeDocumentSequenceSettings(input.defaults);

  await lockSequence(tx, tenantId, key, periodKey);
  const rows = await tx.$queryRaw<SequenceRow[]>`
    INSERT INTO public."DocumentSequence" (
      "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
    ) VALUES (
      ${tenantId}, ${key}, ${periodKey}, ${defaults.prefix}, ${defaults.suffix}, ${defaults.padding}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("tenantId", "key", "periodKey") DO UPDATE
      SET "currentValue" = public."DocumentSequence"."currentValue" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE public."DocumentSequence"."currentValue" < repeat('9', public."DocumentSequence"."padding")::bigint
    RETURNING "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
  `;

  const row = rows[0];
  if (!row) {
    throw new HttpError(409, 'La secuencia documental agotó su capacidad configurada.', {
      code: 'DOCUMENT_SEQUENCE_EXHAUSTED',
      key,
      periodKey
    });
  }
  return {
    number: formatDocumentSequenceNumber({ prefix: row.prefix, suffix: row.suffix, padding: row.padding, value: row.currentValue }),
    sequence: serializeRow(row)
  };
}

export async function listDocumentSequences(input: { tenantId: string; key?: string | null }) {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) throw validationError('tenantId es obligatorio para consultar secuencias.', 'DOCUMENT_SEQUENCE_TENANT_REQUIRED');
  if (input.key) {
    const key = normalizeDocumentSequenceKey(input.key);
    const rows = await prisma.$queryRaw<SequenceRow[]>`
      SELECT "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
      FROM public."DocumentSequence"
      WHERE "tenantId" = ${tenantId} AND "key" = ${key}
      ORDER BY "key", "periodKey"
    `;
    return rows.map(serializeRow);
  }
  const rows = await prisma.$queryRaw<SequenceRow[]>`
    SELECT "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
    FROM public."DocumentSequence"
    WHERE "tenantId" = ${tenantId}
    ORDER BY "key", "periodKey"
  `;
  return rows.map(serializeRow);
}

export async function configureDocumentSequence(input: {
  tenantId: string;
  key: string;
  periodKey?: string | null;
  prefix?: string;
  suffix?: string;
  padding?: number;
  currentValue?: string | number | bigint;
}) {
  const tenantId = String(input.tenantId || '').trim();
  if (!tenantId) throw validationError('tenantId es obligatorio para configurar secuencias.', 'DOCUMENT_SEQUENCE_TENANT_REQUIRED');
  const key = normalizeDocumentSequenceKey(input.key);
  const periodKey = normalizeDocumentSequencePeriodKey(input.periodKey);

  return prisma.$transaction(async (tx) => {
    await lockSequence(tx, tenantId, key, periodKey);
    const existingRows = await tx.$queryRaw<SequenceRow[]>`
      SELECT "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
      FROM public."DocumentSequence"
      WHERE "tenantId" = ${tenantId} AND "key" = ${key} AND "periodKey" = ${periodKey}
      FOR UPDATE
    `;
    const existing = existingRows[0];
    const settings = normalizeDocumentSequenceSettings({
      prefix: input.prefix ?? existing?.prefix ?? '',
      suffix: input.suffix ?? existing?.suffix ?? '',
      padding: input.padding ?? existing?.padding ?? DEFAULT_PADDING
    });
    const currentValue = normalizeDocumentSequencePosition(
      input.currentValue ?? existing?.currentValue ?? 0n,
      settings.padding
    );

    const rows = await tx.$queryRaw<SequenceRow[]>`
      INSERT INTO public."DocumentSequence" (
        "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
      ) VALUES (
        ${tenantId}, ${key}, ${periodKey}, ${settings.prefix}, ${settings.suffix}, ${settings.padding}, ${currentValue}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tenantId", "key", "periodKey") DO UPDATE
        SET "prefix" = EXCLUDED."prefix",
            "suffix" = EXCLUDED."suffix",
            "padding" = EXCLUDED."padding",
            "currentValue" = EXCLUDED."currentValue",
            "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "tenantId", "key", "periodKey", "prefix", "suffix", "padding", "currentValue", "createdAt", "updatedAt"
    `;
    return serializeRow(rows[0]);
  });
}