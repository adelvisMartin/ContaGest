import { prisma } from '../src/database/prisma.js';
import { runWithRuntimeTenant } from '../src/database/runtime-tenant-context.js';

function required(name:string){
  const value=String(process.env[name]||'').trim();
  if(!value)throw new Error(`V846_ENV_REQUIRED:${name}`);
  return value;
}

const tenantA=required('V846_TENANT_A');
const tenantB=required('V846_TENANT_B');
const clientA=required('V846_CLIENT_A');
const clientB=required('V846_CLIENT_B');

async function tenantProbe(tenantId:string,ownClientId:string,foreignClientId:string){
  await runWithRuntimeTenant(tenantId,()=>prisma.$transaction(async tx=>{
    const context=await tx.$queryRaw<Array<{tenant:string|null}>>`SELECT current_setting('contagest.tenant_id',true) AS tenant`;
    if(context[0]?.tenant!==tenantId)throw new Error('PRISMA_TENANT_CONTEXT_NOT_BOUND');
    const own=await tx.client.findUnique({where:{id:ownClientId},select:{id:true,tenantId:true}});
    if(!own||own.id!==ownClientId||own.tenantId!==tenantId)throw new Error('PRISMA_OWN_TENANT_NOT_VISIBLE');
    const foreign=await tx.client.findUnique({where:{id:foreignClientId},select:{id:true}});
    if(foreign)throw new Error('PRISMA_CROSS_TENANT_VISIBLE');
  }));
}

try{
  const noContext=await prisma.client.count();
  if(noContext!==0)throw new Error('PRISMA_CONTEXT_LEAK_NO_CONTEXT');

  await tenantProbe(tenantA,clientA,clientB);
  if(await prisma.client.count()!==0)throw new Error('PRISMA_CONTEXT_LEAK_AFTER_A');
  await tenantProbe(tenantB,clientB,clientA);
  if(await prisma.client.count()!==0)throw new Error('PRISMA_CONTEXT_LEAK_AFTER_B');

  let rolledBack=false;
  try{
    await runWithRuntimeTenant(tenantA,()=>prisma.$transaction(async tx=>{
      const context=await tx.$queryRaw<Array<{tenant:string|null}>>`SELECT current_setting('contagest.tenant_id',true) AS tenant`;
      if(context[0]?.tenant!==tenantA)throw new Error('PRISMA_TENANT_CONTEXT_NOT_BOUND');
      throw new Error('V846_EXPECTED_THROW');
    }));
  }catch(error){
    if(String((error as Error)?.message||error).includes('V846_EXPECTED_THROW'))rolledBack=true;
    else throw error;
  }
  if(!rolledBack)throw new Error('PRISMA_ROLLBACK_PROBE_DID_NOT_THROW');
  if(await prisma.client.count()!==0)throw new Error('PRISMA_CONTEXT_LEAK_AFTER_ROLLBACK');

  process.stdout.write(JSON.stringify({ticket:846,probe:'prisma-interactive-transaction',verdict:'PASS'})+'\n');
}finally{
  await prisma.$disconnect().catch(()=>{});
}
