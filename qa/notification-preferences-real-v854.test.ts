import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

/** Isolated real PG17 with _v854 DB and #845 RLS sidecar. */
test('#854 self-service in-app consent persists without provider delivery claims',async(t)=>{
  assert.equal(process.env.CG_NOTIFICATION_PREF_QA_ISOLATED,'true',
    'BLOCKED: explicit disposable database required');
  assert.notEqual(process.env.NODE_ENV,'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV);
  const {prisma}=await import('../backend/src/database/prisma.ts');
  const db=await prisma.$queryRaw<Array<{db:string;major:number}>>`
    SELECT current_database() AS db,current_setting('server_version_num')::int/10000 AS major
  `;
  assert.match(db[0]?.db||'',/_v854$/);
  assert.equal(db[0]?.major,17);
  const h=await createRealBackendHarness();
  t.after(async()=>h.close());

  const empty=await h.ok('/notifications/preferences/me');
  assert.equal(empty.channel,'in_app');
  assert.equal(empty.enabled,false);
  const body={enabled:true,consent:'granted',quietHours:{
    timeZone:'America/Caracas',start:'22:00',end:'06:00'
  }};
  const set=await h.ok('/notifications/preferences/me',{
    method:'PUT',body:JSON.stringify(body)
  });
  assert.equal(set.consent,'granted');
  assert.equal(set.enabled,true);
  assert.equal(set.quietStart,'22:00');
  const saved=await h.ok('/notifications/preferences/me');
  assert.equal(saved.timeZone,'America/Caracas');

  const stored=await h.prisma.notificationChannelPreference.findUnique({
    where:{tenantId_userId_channel:{
      tenantId:h.tenant.id,userId:h.admin.id,channel:'in_app'
    }}
  });
  assert.equal(stored?.verifiedSource,'authenticated-self-service');
  assert.ok(stored?.verifiedAt);

  await h.status('/notifications/preferences/me',422,{
    method:'PUT',body:JSON.stringify({...body,tenantId:'other'})
  });
  await h.status('/notifications/preferences/me',422,{
    method:'PUT',body:JSON.stringify({enabled:true,consent:'denied'})
  });
  await h.status('/notifications/preferences/me',422,{
    method:'PUT',body:JSON.stringify({
      ...body,quietHours:{timeZone:'Not/A_Real_Timezone',start:'22:00',end:'06:00'}
    })
  });
  const disabled=await h.ok('/notifications/preferences/me',{
    method:'PUT',body:JSON.stringify({enabled:false,consent:'denied'})
  });
  assert.equal(disabled.enabled,false);
  const audit=await h.prisma.auditLog.findMany({
    where:{tenantId:h.tenant.id,entity:'NotificationChannelPreference',
      entityId:stored!.id,action:'notification.preference.self-updated'}
  });
  assert.ok(audit.length>=2);
  const denied=await h.status('/notifications/whatsapp/order',503,{
    method:'POST',body:JSON.stringify({
      order:{phone:'+584121234567'},message:'Aviso QA, no enviar.'
    })
  });
  assert.equal(denied.response.status,503);
  const unauth=await h.request('/notifications/preferences/me',{},'');
  assert.equal(unauth.response.status,401);
});
