import type {Request,Response,NextFunction} from 'express';
import {prisma} from '../../database/prisma.js';
import {isProd} from '../../config/env.js';
import {hasPlatformAccess} from '../identity/platformAccess.js';
import {HttpError} from '../http.js';
import {currentLegalDocuments} from './legalCatalog.js';
import {legalRuntimeProductionReady} from './legalReleaseRuntimeGate.js';

async function hasLicensedCustomerAccess(userId:string,tenantId:string){
  const count=await prisma.licenseKey.count({where:{userId,tenantId,status:'active',expiresAt:{gt:new Date()}}});
  return count>0;
}

export async function requireCurrentLegalAcceptance(req:Request,_res:Response,next:NextFunction){
  try{
    const ctx=(req as any).context as {tenantId?:string;userId?:string}|undefined;
    if(!ctx?.tenantId||!ctx.userId)return next();
    if(await hasPlatformAccess(ctx))return next();
    // The first-access adhesion flow is a customer-license gate. Only a verified
    // platform identity may bypass it; Role.system is never used as authority.
    if(!await hasLicensedCustomerAccess(ctx.userId,ctx.tenantId))return next();
    // Runtime enforcement complements the release gate: a manual deployment cannot
    // expose licensed customer business APIs before the professional review evidence
    // is bound to the exact legal document version used by this build.
    if(isProd&&!legalRuntimeProductionReady())throw new HttpError(503,'Gate legal de producción incompleto. No se habilitan clientes reales.');
    const required=currentLegalDocuments().filter((doc)=>doc.required);
    const accepted=await prisma.$queryRaw<Array<{documentCode:string;documentVersion:string;documentHash:string}>>`
      SELECT "documentCode","documentVersion","documentHash"
      FROM public."LegalAcceptance"
      WHERE "tenantId"=${ctx.tenantId} AND "userId"=${ctx.userId}
    `;
    const keys=new Set(accepted.map((row)=>`${row.documentCode}:${row.documentVersion}:${row.documentHash}`));
    const pending=required.filter((doc)=>!keys.has(`${doc.code}:${doc.version}:${doc.hash}`));
    if(pending.length)throw new HttpError(428,`Aceptación legal pendiente: ${pending.map((doc)=>doc.code).join(', ')}`);
    next();
  }catch(error){next(error);}
}
