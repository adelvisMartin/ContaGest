import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';

// Only run against the ephemeral restore target provided by #646.
test('#646 restored ERP API has matching liveness, readiness and synthetic tenant scope', async (t) => {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/contagest_verify_[a-z0-9_]+_e2e$/);
  assert.equal(process.env.NODE_ENV,'test');
  const ids=(process.env.DR646_TENANT_IDS||'').split(',').filter(Boolean);
  assert.equal(ids.length,2);
  assert.ok(ids.every(x=>/^[a-f0-9-]{36}$/i.test(x)));
  const found=await prisma.tenant.findMany({where:{id:{in:ids}},select:{id:true}});
  assert.equal(found.length,2,'both synthetic tenants must be available through Prisma');
  const app=createApp();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{
    server.once('listening',resolve);server.once('error',reject);
  });
  t.after(async()=>{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await prisma.$disconnect();
  });
  const addr=server.address() as AddressInfo;
  const base='http://127.0.0.1:'+addr.port;
  const live=await fetch(base+'/health/live',{redirect:'error',cache:'no-store'});
  assert.equal(live.status,200);
  const l=await live.json();
  assert.equal(l.status,'live');
  assert.equal(l.buildCommit,process.env.GIT_COMMIT_SHA);
  const ready=await fetch(base+'/health/ready',{redirect:'error',cache:'no-store'});
  assert.equal(ready.status,200);
  const v=await ready.json();
  assert.equal(v.status,'ready');
  assert.equal(v.checks?.database,'ok');
});
