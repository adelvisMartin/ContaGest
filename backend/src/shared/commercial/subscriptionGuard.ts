import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

type SubscriptionAccessRow={
  status:string;
  graceUntil:Date|null;
  currentPeriodEnd:Date|null;
  nextRenewalAt:Date|null;
  tenantStatus:string;
};

export async function assertSubscriptionAccess(subscriptionId:string|null|undefined,tenantId:string){
  if(!subscriptionId)return;
  const rows=await prisma.$queryRaw<SubscriptionAccessRow[]>`
    SELECT s."status",s."graceUntil",s."currentPeriodEnd",s."nextRenewalAt",st."status" AS "tenantStatus"
    FROM public."Subscription" s
    JOIN public."SubscriptionTenant" st ON st."subscriptionId"=s."id"
    WHERE s."id"=${subscriptionId} AND st."tenantId"=${tenantId}
    LIMIT 1
  `;
  const row=rows[0];
  if(!row||row.tenantStatus!=='active')throw new HttpError(403,'Esta empresa ya no está incluida en la suscripción.');
  if(row.status==='active'||row.status==='trial')return;
  if(row.status==='past_due'&&row.graceUntil&&new Date(row.graceUntil).getTime()>Date.now())return;
  if(row.status==='past_due')throw new HttpError(402,'La suscripción está vencida y terminó su período de gracia. Registra la renovación para continuar.');
  if(row.status==='suspended')throw new HttpError(403,'La suscripción está suspendida. Reactívala desde la administración comercial.');
  if(row.status==='cancelled'||row.status==='expired')throw new HttpError(403,'La suscripción comercial ya no está activa.');
  throw new HttpError(403,'La suscripción no autoriza el acceso en este momento.');
}
