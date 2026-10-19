import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync('backend/src/modules/verticals/gym-training.routes.ts','utf8');
const start=source.indexOf("router.get('/gym/equipment-requirements'");
const finish=source.indexOf("router.get('/gym/exercises'",start);
assert.ok(start>=0&&finish>start);
const routeSource=source.slice(start,finish)
  .replace('prisma.$queryRawUnsafe<Array<{equipment:string;exerciseCount:number}>>','prisma.$queryRawUnsafe');
async function exercise(rows,tenantId='tenant-A'){
  const calls=[];
  const router={get:(_path,_permission,handler)=>calls.push(handler)};
  let query,params,body;
  new Function('router','requirePermission','asyncHandler','ctx','prisma','ok',routeSource)(
    router,()=>true,handler=>handler,req=>req.context,
    {$queryRawUnsafe:async(sql,...args)=>{query=sql;params=args;return rows}},
    (_res,value)=>{body=value});
  assert.equal(calls.length,1);
  await calls[0]({context:{tenantId}}, {});
  return {query,params,body};
}

test('#799 returns only demand labels and counts, never physical availability',async()=>{
  const result=await exercise([{equipment:'Banda',exerciseCount:3}]);
  assert.deepEqual(result.body,{items:[{equipment:'Banda',exerciseCount:3}],
    truncated:false,authority:'exercise_equipment_requirements',assetAvailabilityVerified:false});
});
test('#799 derives tenant from server context and uses SQL bind only',async()=>{
  const out=await exercise([], 'tenant-secret-B');
  assert.deepEqual(out.params,['tenant-secret-B']);
  assert.match(out.query,/"tenantId"=\$1/);
  assert.match(out.query,/"active"=true/);
  assert.doesNotMatch(out.query,/\$\{.*tenantId/);
});
test('#799 bound 201st category is flagged rather than silently lost',async()=>{
  const rows=Array.from({length:201},(_,i)=>({equipment:'E'+i,exerciseCount:1}));
  const out=await exercise(rows);
  assert.equal(out.body.items.length,200);
  assert.equal(out.body.truncated,true);
  assert.match(out.query,/LIMIT 201/);
});
test('#799 blank equipment excluded and deterministic requirement ranking',async()=>{
  const out=await exercise([]);
  assert.match(out.query,/NULLIF\(btrim\("equipment"\),''\) IS NOT NULL/);
  assert.match(out.query,/ORDER BY "exerciseCount" DESC,"equipment" ASC/);
  assert.match(out.query,/GROUP BY btrim\("equipment"\)/);
});
test('#799 method guarded by gym.manage, no new asset or ledger writes',()=>{
  assert.match(routeSource,/requirePermission\('gym\.manage'\)/);
  assert.doesNotMatch(routeSource,/INSERT |UPDATE |DELETE |GymEquipment|FixedAsset|GymPayment|localStorage/);
});
