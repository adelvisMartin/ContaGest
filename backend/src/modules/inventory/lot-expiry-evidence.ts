/** #755: expiry calendar evidence, not FEFO allocation nor stock authority. */
export type LotExpiryRecord = Readonly<{
  id:string;tenantId:string;productId:string;lotNumber:string;
  expiresAt:Date|null;receivedAt:Date;active:boolean;
}>;
const DATE=/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const fail=():never=>{throw new Error('LOT_EXPIRY_EVIDENCE_INVALID');};
function day(value:string):boolean{
  return typeof value==='string'&&DATE.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00.000Z'))&&
    new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;
}
export function classifyLotExpiryWindow(input:{
  tenantId:string;asOf:string;horizonDays:number;lots:readonly LotExpiryRecord[];
}) {
  if(!input||typeof input.tenantId!=='string'||!input.tenantId.trim()||!day(input.asOf)||
     !Number.isSafeInteger(input.horizonDays)||input.horizonDays<0||input.horizonDays>365||
     !Array.isArray(input.lots)||input.lots.length>100)fail();
  const today=Date.parse(input.asOf+'T00:00:00.000Z');
  const until=today+input.horizonDays*86_400_000;
  const ids=new Set<string>();
  const list=input.lots.map(row=>{
    if(!row||row.tenantId!==input.tenantId||
      typeof row.id!=='string'||!row.id||ids.has(row.id)||
      typeof row.productId!=='string'||!row.productId||
      typeof row.lotNumber!=='string'||!row.lotNumber||
      row.active!==true||
      !(row.receivedAt instanceof Date)||!Number.isFinite(row.receivedAt.getTime())||
      (row.expiresAt!==null&&(!(row.expiresAt instanceof Date)||!Number.isFinite(row.expiresAt.getTime()))))fail();
    ids.add(row.id);
    const when=row.expiresAt===null?null:Date.UTC(row.expiresAt.getUTCFullYear(),row.expiresAt.getUTCMonth(),row.expiresAt.getUTCDate());
    const status=when===null?'UNKNOWN_EXPIRY':when<today?'EXPIRED':when<=until?'EXPIRING':'OUTSIDE_WINDOW';
    return Object.freeze({
      lotId:row.id,productId:row.productId,lotNumber:row.lotNumber,
      expiresOn:when===null?null:new Date(when).toISOString().slice(0,10),
      receivedAt:row.receivedAt.toISOString(),expiryStatus:status,
      availableQuantityVerified:false as const,allocationAuthorized:false as const,
    });
  });
  return Object.freeze({
    tenantId:input.tenantId,asOf:input.asOf,horizonDays:input.horizonDays,
    lotCount:list.length,lots:Object.freeze(list),
    status:'READ_ONLY_EXPIRY_DIAGNOSTIC' as const,
  });
}
