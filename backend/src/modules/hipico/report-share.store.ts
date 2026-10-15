import { prisma } from '../../database/prisma.js';
import type { Prisma } from '@prisma/client';
import {
  createReportToken, dateWindowCaracas, expiryDate, hashReportToken, shareAllowed
} from './report-share-policy.js';

type NewShare = { ownerId: string; groupKey: string; audience: 'participant' | 'group'; participantCode?: string; hours: number };
type Share = {
  id: string; ownerId: string; groupKey: string; audience: 'participant' | 'group';
  participantCode: string | null; expiresAt: Date; revokedAt: Date | null;
};
type LedgerRow = {
  participantCode: string; currency: string; entryType: string;
  amountMinor: string; raceKey: string | null; createdAt: Date;
};
type BalanceRow = { participantCode: string; currency: string; amountMinor: string };

async function ownerTransaction<T>(ownerId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Scope survives only on this transaction, including under PgBouncer.
    await tx.$queryRaw`SELECT set_config('hipico.report_owner_id', ${ownerId}, true)`;
    return fn(tx);
  }, { isolationLevel: 'RepeatableRead' });
}

export async function issueHipicoReportLink(input: NewShare, now = new Date()) {
  const token = createReportToken();
  const tokenHash = hashReportToken(token);
  const expiresAt = expiryDate(input.hours, now);
  const participant = input.audience === 'participant' ? input.participantCode! : null;
  const created = await ownerTransaction(input.ownerId, async (tx) => {
    const exists = await tx.$queryRaw<Array<{ found: boolean }>>`
      SELECT true AS "found"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey}
        AND (${participant}::text IS NULL OR participant_code=${participant})
      LIMIT 1
    `;
    if (!exists[0]?.found) throw new Error('HIPICO_REPORT_LEDGER_SCOPE_NOT_FOUND');
    return tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`
      INSERT INTO public.hipico_report_share_links(owner_id,group_key,audience,participant_code,token_hash,expires_at)
      VALUES (${input.ownerId}::uuid,${input.groupKey},${input.audience},${participant},${tokenHash},${expiresAt})
      RETURNING id::text, expires_at AS "expiresAt"
    `;
  });
  if (!created[0]) throw new Error('HIPICO_REPORT_ISSUE_UNAVAILABLE');
  // Caller sees the raw token exactly once, only through the authenticated issuance response.
  return { id: created[0].id, token, expiresAt: created[0].expiresAt };
}

export async function listHipicoReportLinks(ownerId: string, groupKey: string) {
  return ownerTransaction(ownerId, async (tx) => tx.$queryRaw<Array<{
    id: string; groupKey: string; audience: string; participantCode: string | null;
    createdAt: Date; expiresAt: Date; revokedAt: Date | null;
  }>>`
    SELECT id::text,group_key AS "groupKey",audience,participant_code AS "participantCode",
           created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt"
    FROM public.hipico_report_share_links
    WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
    ORDER BY created_at DESC LIMIT 100
  `);
}

export async function revokeHipicoReportLink(ownerId: string, id: string) {
  const rows = await ownerTransaction(ownerId, async (tx) => tx.$queryRaw<Array<{ id: string }>>`
    UPDATE public.hipico_report_share_links
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE id = ${id}::uuid AND owner_id = ${ownerId}::uuid
    RETURNING id::text
  `);
  return Boolean(rows[0]);
}

export async function readHipicoReportLink(ownerId: string, token: string, date: string, now = new Date()) {
  const hash = hashReportToken(token);
  const { from, until } = dateWindowCaracas(date);
  return ownerTransaction(ownerId, async (tx) => {
    const shares = await tx.$queryRaw<Share[]>`
      SELECT id::text,owner_id::text AS "ownerId",group_key AS "groupKey",
             audience,participant_code AS "participantCode",expires_at AS "expiresAt",
             revoked_at AS "revokedAt"
      FROM public.hipico_report_share_links
      WHERE owner_id=${ownerId}::uuid AND token_hash=${hash}
      LIMIT 1 FOR SHARE
    `;
    const share = shares[0];
    if (!share || !shareAllowed(share, now)) return null;
    const groupKey = share.groupKey;
    const participantCode = share.participantCode;
    const participantOnly = share.audience === 'participant';
    // Ledger is an immutable source: never reuse client-side workspace balances as server truth.
    // Query the same owner+group+participant scope for every projection.
    const balances = await tx.$queryRaw<BalanceRow[]>`
      SELECT participant_code AS "participantCode",currency,
             COALESCE(SUM(amount_minor),0)::text AS "amountMinor"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND created_at < ${until}
        AND (${!participantOnly} OR participant_code=${participantCode})
      GROUP BY participant_code,currency
      ORDER BY participant_code,currency LIMIT 101
    `;
    const entries = await tx.$queryRaw<LedgerRow[]>`
      SELECT participant_code AS "participantCode",currency,
             entry_type AS "entryType",amount_minor::text AS "amountMinor",
             race_key AS "raceKey",created_at AS "createdAt"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND created_at >= ${from} AND created_at < ${until}
        AND (${!participantOnly} OR participant_code=${participantCode})
      ORDER BY created_at DESC,id DESC LIMIT 101
    `;
    return {
      // Do not emit internal owner IDs, link identifiers, raw token, participant PII, provenance or chat content.
      scope: share.audience, groupKey: share.groupKey, participantCode: participantOnly ? participantCode : null,
      date, source: 'canonical-postgresql-ledger', expiresAt: share.expiresAt.toISOString(),
      balances: balances.slice(0, 100), entries: entries.slice(0, 100),
      balancesTruncated: balances.length > 100, entriesTruncated: entries.length > 100,
      // Pizarras and wager descriptions are not derived from this ledger table; do not invent them.
      racesAvailable: false
    };
  });
}


const CONSOLIDATED_PAGE_SIZE = 21;

function startOfCaracasWeek(date: string) {
  const day = new Date(date + 'T12:00:00.000Z');
  const daysAfterMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysAfterMonday);
  return new Date(day.toISOString().slice(0, 10) + 'T04:00:00.000Z');
}

type ConsolidatedRow = {
  participantCode: string;
  currency: string;
  balanceMinor: string;
  daySettlementMinor: string;
  weekSettlementMinor: string;
};
type ConsolidatedTotal = { currency: string; balanceMinor: string };
type ConsolidatedCount = { participants: number };

/**
 * Public consolidated view is intentionally LESS expressive than the internal
 * PWA view. A ledger entry is bet/settlement/adjustment/reversal only; source
 * does not encode deposit, withdrawal, aval, transfer or refund semantics.
 * Reversals of settlements are included in period net, so cancelled
 * settlements do not continue counting as confirmed winnings.
 *
 * Never fill a missing financial column with fabricated 0.
 * Only group audience tokens may access this aggregate.
 */
export async function readHipicoConsolidatedShare(
  ownerId: string,
  token: string,
  date: string,
  page: number,
  search = '',
  now = new Date()
) {
  const hash = hashReportToken(token);
  const { until, from } = dateWindowCaracas(date);
  const weekFrom = startOfCaracasWeek(date);
  const offset = (page - 1) * CONSOLIDATED_PAGE_SIZE;
  return ownerTransaction(ownerId, async (tx) => {
    const shares = await tx.$queryRaw<Share[]>`
      SELECT id::text, owner_id::text AS "ownerId", group_key AS "groupKey",
             audience, participant_code AS "participantCode",
             expires_at AS "expiresAt", revoked_at AS "revokedAt"
      FROM public.hipico_report_share_links
      WHERE owner_id=${ownerId}::uuid AND token_hash=${hash}
      LIMIT 1 FOR SHARE
    `;
    const share = shares[0];
    if (!share || !shareAllowed(share, now) || share.audience !== 'group') return null;
    const groupKey = share.groupKey;
    const needle = search.toLocaleLowerCase('es-VE');
    const groupCount = await tx.$queryRaw<ConsolidatedCount[]>`
      SELECT COUNT(DISTINCT participant_code)::int AS participants
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND created_at < ${until}
    `;
    const matchedCount = await tx.$queryRaw<ConsolidatedCount[]>`
      SELECT COUNT(DISTINCT participant_code)::int AS participants
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND created_at < ${until}
        AND (${needle}='' OR position(${needle} in lower(participant_code)) > 0)
    `;
    const rows = await tx.$queryRaw<ConsolidatedRow[]>`
      WITH participant_page AS (
        SELECT participant_code
        FROM public.hipico_money_ledger_entries
        WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND created_at < ${until}
          AND (${needle}='' OR position(${needle} in lower(participant_code)) > 0)
        GROUP BY participant_code
        ORDER BY participant_code
        LIMIT ${CONSOLIDATED_PAGE_SIZE} OFFSET ${offset}
      )
      SELECT e.participant_code AS "participantCode",e.currency,
        SUM(e.amount_minor)::text AS "balanceMinor",
        COALESCE(SUM(e.amount_minor) FILTER (
          WHERE (e.entry_type='settlement' OR
             (e.entry_type='reversal' AND original.entry_type='settlement'))
            AND e.created_at >= ${from}
        ),0)::text AS "daySettlementMinor",
        COALESCE(SUM(e.amount_minor) FILTER (
          WHERE (e.entry_type='settlement' OR
             (e.entry_type='reversal' AND original.entry_type='settlement'))
            AND e.created_at >= ${weekFrom}
        ),0)::text AS "weekSettlementMinor"
      FROM public.hipico_money_ledger_entries e
      JOIN participant_page p ON p.participant_code=e.participant_code
      LEFT JOIN public.hipico_money_ledger_entries original
        ON original.id=e.original_entry_id AND original.owner_id=e.owner_id
          AND original.group_key=e.group_key AND original.participant_code=e.participant_code
          AND original.currency=e.currency
      WHERE e.owner_id=${ownerId}::uuid AND e.group_key=${groupKey}
        AND e.created_at < ${until}
      GROUP BY e.participant_code,e.currency
      ORDER BY e.participant_code,e.currency
    `;
    const groupTotals = await tx.$queryRaw<ConsolidatedTotal[]>`
      SELECT currency,SUM(amount_minor)::text AS "balanceMinor"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND created_at < ${until}
      GROUP BY currency ORDER BY currency
    `;
    const filteredTotals = await tx.$queryRaw<ConsolidatedTotal[]>`
      SELECT currency,SUM(amount_minor)::text AS "balanceMinor"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND created_at < ${until}
        AND (${needle}='' OR position(${needle} in lower(participant_code)) > 0)
      GROUP BY currency ORDER BY currency
    `;
    const participants = Math.max(0,Number(matchedCount[0]?.participants || 0));
    const totalParticipants = Math.max(0,Number(groupCount[0]?.participants || 0));
    return {
      scope: 'group' as const,
      source: 'canonical-postgresql-ledger' as const,
      groupKey,date,
      timezone: 'America/Caracas' as const,
      page,pageSize:CONSOLIDATED_PAGE_SIZE,
      totalParticipants,matchedParticipants:participants,
      pages:Math.max(1,Math.ceil(participants/CONSOLIDATED_PAGE_SIZE)),
      search,rows,groupTotals,filteredTotals,
      // Do not pretend ledger has a source for the other Websimproco columns.
      unavailableColumns: ['available','refund','deposit','withdrawal','transfer','aval'] as const,
      amountUnit: 'minor' as const,balancesAsOf:until.toISOString(),
      expiresAt:share.expiresAt.toISOString()
    };
  });
}
