/**
 * #810: serialize and check animal microchip ownership in the *same*
 * PostgreSQL transaction as a CarePatient create/edit. DB lower/btrim are
 * used for both lock key and predicate, avoiding JS/DB case-fold drift.
 *
 * Existing duplicate rows must be audited before adding a DB unique index;
 * this guard protects the normal API write paths without modifying history.
 */
export async function veterinaryMicrochipTaken(tx,tenantId,microchip,exceptPatientId=null){
  if(typeof tenantId!=='string'||!tenantId)throw new TypeError('VET_MICROCHIP_TENANT_REQUIRED');
  const chip=typeof microchip==='string'?microchip.trim():'';
  if(!chip)return false;
  await tx.$queryRawUnsafe(
    `SELECT pg_advisory_xact_lock(
        hashtextextended('vet:microchip:'||$1||':'||lower(btrim($2)),0)
      )::text AS locked`,tenantId,chip);
  const conflicts=await tx.$queryRawUnsafe(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "kind"='animal'
      AND lower(btrim("microchip"))=lower(btrim($2))
      AND ($3::text IS NULL OR "id"<>$3)
    LIMIT 1
  `,tenantId,chip,exceptPatientId);
  return conflicts.length>0;
}
