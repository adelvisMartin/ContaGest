import type {Request,Response,NextFunction} from 'express';
import {prisma} from '../../database/prisma.js';
import {HttpError} from '../http.js';
import {currentLegalDocuments} from './legalCatalog.js';

async function isPlatformOperator(userId:string,tenantId:string){
  const count=await prisma.userRole.count({where:{
    userId,
    role:{tenantId,permissions:{some:{permission:{key:'platform.manage'}}}}
  }});
  return count>0;
}

export async function requireCurrentLegalAcceptance(req:Request,_res:Response,next:NextFunction){
  try{
    const ctx=(req as any).context as {tenantId?:string;userId?:string}|undefined;
    if(!ctx?.tenantId||!ctx.userId)return next();
    if(await isPlatformOperator(ctx.userId,ctx.tenantId))return next();
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
