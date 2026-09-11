import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';

type LedgerEntryType='bet'|'settlement'|'adjustment'|'reversal';
type LedgerInput={
  ownerId:string;groupKey:string;participantCode:string;currency:string;entryType:LedgerEntryType;
  amountMinor?:bigint|string;raceKey?:string|null;settlementOfKey?:string|null;sourceEventId?:string|null;
  sourceMessageKey?:string|null;idempotencyKey:string;originalEntryId?:string|null;reason?:string|null;metadata?:unknown;
};

type ExistingEntry={
  id:string;amountMinor:string;participantCode:string;currency:string;entryType:string;originalEntryId:string|null;
  raceKey:string|null;settlementOfKey:string|null;sourceEventId:string|null;sourceMessageKey:string|null;
};

function required(value:unknown,code:string){const text=String(value||'').trim();if(!text)throw new Error(code);return text;}
function exactMinor(value:bigint|string|undefined){
  if(value===undefined)throw new Error('HIPICO_LEDGER_AMOUNT_REQUIRED');
  const text=String(value).trim();if(!/^-?\d+$/.test(text))throw new Error('HIPICO_LEDGER_AMOUNT_MINOR_INVALID');return BigInt(text);
}
function nullable(value:unknown){const text=String(value||'').trim();return text||null;}
function idempotencyLockKey(ownerId:string,groupKey:string,idempotencyKey:string){return JSON.stringify([ownerId,groupKey,idempotencyKey]);}

function assertIdempotentReplay(existing:ExistingEntry,input:{participantCode:string;currency:string;entryType:LedgerEntryType;amountMinor:bigint|null;raceKey:string|null;settlementOfKey:string|null;sourceEventId:string|null;sourceMessageKey:string|null;originalEntryId:string|null}){
  const same=existing.participantCode===input.participantCode
    && existing.currency===input.currency
    && existing.entryType===input.entryType
    && existing.originalEntryId===input.originalEntryId
    && existing.raceKey===input.raceKey
    && existing.settlementOfKey===input.settlementOfKey
    && existing.sourceEventId===input.sourceEventId
    && existing.sourceMessageKey===input.sourceMessageKey
    && (input.entryType==='reversal'||BigInt(existing.amountMinor)===input.amountMinor);
  if(!same)throw Object.assign(new Error('Ledger idempotency key was reused with different financial content.'),{code:'HIPICO_LEDGER_IDEMPOTENCY_MISMATCH'});
}

export async function appendHipicoLedgerEntry(input:LedgerInput){
  const ownerId=required(input.ownerId,'HIPICO_LEDGER_OWNER_REQUIRED');
  const groupKey=required(input.groupKey,'HIPICO_LEDGER_GROUP_REQUIRED');
  const participantCode=required(input.participantCode,'HIPICO_LEDGER_PARTICIPANT_REQUIRED');
  const currency=required(input.currency,'HIPICO_LEDGER_CURRENCY_REQUIRED').toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('HIPICO_LEDGER_CURRENCY_INVALID');
  const idempotencyKey=required(input.idempotencyKey,'HIPICO_LEDGER_IDEMPOTENCY_REQUIRED');
  const originalEntryId=nullable(input.originalEntryId);
  const raceKey=nullable(input.raceKey);
  const settlementOfKey=nullable(input.settlementOfKey);
  const sourceEventId=nullable(input.sourceEventId);
  const sourceMessageKey=nullable(input.sourceMessageKey);
  if(input.entryType==='reversal'&&!originalEntryId)throw new Error('HIPICO_LEDGER_REVERSAL_ORIGINAL_REQUIRED');
  if(input.entryType==='settlement'&&!settlementOfKey)throw new Error('HIPICO_LEDGER_SETTLEMENT_KEY_REQUIRED');
  const requestedAmount=input.entryType==='reversal'?null:exactMinor(input.amountMinor);

  return prisma.$transaction(async(tx)=>{
    const lockKey=idempotencyLockKey(ownerId,groupKey,idempotencyKey);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;

    const duplicate=await tx.$queryRaw<ExistingEntry[]>`
      SELECT id, amount_minor::text AS "amountMinor", participant_code AS "participantCode", currency,
             entry_type AS "entryType", original_entry_id AS "originalEntryId", race_key AS "raceKey",
             settlement_of_key AS "settlementOfKey", source_event_id AS "sourceEventId", source_message_key AS "sourceMessageKey"
      FROM public.hipico_money_ledger_entries
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND idempotency_key=${idempotencyKey}
      LIMIT 1
    `;
    if(duplicate[0]){
      assertIdempotentReplay(duplicate[0],{participantCode,currency,entryType:input.entryType,amountMinor:requestedAmount,raceKey,settlementOfKey,sourceEventId,sourceMessageKey,originalEntryId});
      return{entryId:duplicate[0].id,amountMinor:duplicate[0].amountMinor,duplicate:true};
    }

    let amountMinor=requestedAmount??0n;
    if(input.entryType==='reversal'){
      const originals=await tx.$queryRaw<Array<ExistingEntry>>`
        SELECT id,amount_minor::text AS "amountMinor",participant_code AS "participantCode",currency,
               entry_type AS "entryType",original_entry_id AS "originalEntryId",race_key AS "raceKey",
               settlement_of_key AS "settlementOfKey",source_event_id AS "sourceEventId",source_message_key AS "sourceMessageKey"
        FROM public.hipico_money_ledger_entries
        WHERE id=${originalEntryId} AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
        LIMIT 1
      `;
      const original=originals[0];if(!original)throw new Error('HIPICO_LEDGER_ORIGINAL_NOT_FOUND');
      if(original.entryType==='reversal')throw new Error('HIPICO_LEDGER_REVERSAL_OF_REVERSAL_FORBIDDEN');
      if(original.participantCode!==participantCode||original.currency!==currency)throw new Error('HIPICO_LEDGER_REVERSAL_SCOPE_MISMATCH');
      const reversed=await tx.$queryRaw<Array<{id:string}>>`
        SELECT id FROM public.hipico_money_ledger_entries
        WHERE original_entry_id=${originalEntryId} AND entry_type='reversal'
          AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
        LIMIT 1
      `;
      if(reversed[0])throw new Error('HIPICO_LEDGER_ALREADY_REVERSED');
      amountMinor=-BigInt(original.amountMinor);
    }

    const id=crypto.randomUUID();
    const metadata=input.metadata==null?'{}':JSON.stringify(input.metadata);
    await tx.$executeRaw`
      INSERT INTO public.hipico_money_ledger_entries(
        id,owner_id,group_key,participant_code,currency,entry_type,amount_minor,race_key,settlement_of_key,
        source_event_id,source_message_key,idempotency_key,original_entry_id,reason,metadata
      ) VALUES (
        ${id},${ownerId}::uuid,${groupKey},${participantCode},${currency},${input.entryType},${amountMinor.toString()}::numeric,
        ${raceKey},${settlementOfKey},${sourceEventId},${sourceMessageKey},
        ${idempotencyKey},${originalEntryId},${input.reason||null},${metadata}::jsonb
      )
    `;
    await tx.$executeRaw`
      INSERT INTO public.hipico_money_accounts(owner_id,group_key,participant_code,currency,balance_minor)
      VALUES (${ownerId}::uuid,${groupKey},${participantCode},${currency},${amountMinor.toString()}::numeric)
      ON CONFLICT (owner_id,group_key,participant_code,currency)
      DO UPDATE SET balance_minor=public.hipico_money_accounts.balance_minor+EXCLUDED.balance_minor,updated_at=now()
    `;
    const reconciliation=await tx.$queryRaw<Array<{balanceMinor:string;sumMinor:string}>>`
      SELECT a.balance_minor::text AS "balanceMinor",
             COALESCE((SELECT SUM(e.amount_minor) FROM public.hipico_money_ledger_entries e
               WHERE e.owner_id=a.owner_id AND e.group_key=a.group_key AND e.participant_code=a.participant_code AND e.currency=a.currency),0)::text AS "sumMinor"
      FROM public.hipico_money_accounts a
      WHERE a.owner_id=${ownerId}::uuid AND a.group_key=${groupKey} AND a.participant_code=${participantCode} AND a.currency=${currency}
    `;
    const check=reconciliation[0];
    if(!check||check.balanceMinor!==check.sumMinor)throw new Error('HIPICO_LEDGER_RECONCILIATION_MISMATCH');
    return{entryId:id,amountMinor:amountMinor.toString(),balanceMinor:check.balanceMinor,duplicate:false};
  });
}

export async function reconcileHipicoLedger(ownerId:string,groupKey:string){
  return prisma.$queryRaw<Array<{participantCode:string;currency:string;balanceMinor:string;sumMinor:string;matches:boolean}>>`
    SELECT a.participant_code AS "participantCode",a.currency,a.balance_minor::text AS "balanceMinor",
      COALESCE(SUM(e.amount_minor),0)::text AS "sumMinor",
      (a.balance_minor=COALESCE(SUM(e.amount_minor),0)) AS matches
    FROM public.hipico_money_accounts a
    LEFT JOIN public.hipico_money_ledger_entries e
      ON e.owner_id=a.owner_id AND e.group_key=a.group_key AND e.participant_code=a.participant_code AND e.currency=a.currency
    WHERE a.owner_id=${ownerId}::uuid AND a.group_key=${groupKey}
    GROUP BY a.owner_id,a.group_key,a.participant_code,a.currency,a.balance_minor
    ORDER BY a.participant_code,a.currency
  `;
}

export const __test__={assertIdempotentReplay,idempotencyLockKey};
