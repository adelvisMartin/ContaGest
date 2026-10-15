import { prisma } from '../../database/prisma.js';
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

async function ownerTransaction<T>(ownerId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('hipico.report_owner_id', ${ownerId}, true)`;
    return fn(tx);
  });
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
      LIMIT 1
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
