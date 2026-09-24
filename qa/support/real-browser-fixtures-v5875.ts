import { randomUUID } from 'node:crypto';
import { prisma } from '../../backend/src/database/prisma.ts';

const action=String(process.argv[2]||'').trim();
const run=String(process.env.CG_REAL_BROWSER_RUN||'').trim();
if(!run)throw new Error('CG_REAL_BROWSER_RUN is required.');
if(String(process.env.NODE_ENV||'').toLowerCase()==='production')throw new Error('58/75 fixtures must never run in production.');
const prefix=`V58-${run}`;
const foreignRif=`QA58-${run}`.slice(0,32);

async function cleanup(){
  await prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "memberCode" LIKE $1 OR "fullName" LIKE $2',`${prefix}%`,`${prefix}%`).catch(()=>undefined);
  await prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "displayName" LIKE $1',`${prefix}%`).catch(()=>undefined);
  await prisma.tenant.deleteMany({where:{rif:foreignRif}}).catch(()=>undefined);
}

async function setup(){
  await cleanup();
  const foreign=await prisma.tenant.create({data:{rif:foreignRif,name:`${prefix} Foreign`,legalName:`${prefix} Foreign C.A.`,plan:'commercial',status:'active',settings:{}}});
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."CarePatient" ("id","tenantId","kind","displayName","active","emergencyContact","createdAt","updatedAt") VALUES ($1,$2,\'human\',$3,true,\'{}\'::jsonb,now(),now())',
    randomUUID(),foreign.id,`${prefix}-FOREIGN-PATIENT`
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."CarePatient" ("id","tenantId","kind","displayName","species","active","emergencyContact","createdAt","updatedAt") VALUES ($1,$2,\'animal\',$3,\'canine\',true,\'{}\'::jsonb,now(),now())',
    randomUUID(),foreign.id,`${prefix}-FOREIGN-PET`
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO public."GymMember" ("id","tenantId","memberCode","fullName","emergencyContact","goals","status","joinedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'{}\'::jsonb,\'[]\'::jsonb,\'active\',now(),now(),now())',
    randomUUID(),foreign.id,`${prefix}-FOREIGN-MEMBER`,`${prefix}-FOREIGN-MEMBER`
  );
}

try{
  if(action==='setup')await setup();
  else if(action==='cleanup')await cleanup();
  else throw new Error('Usage: real-browser-fixtures-v5875.ts <setup|cleanup>');
}finally{
  await prisma.$disconnect();
}
