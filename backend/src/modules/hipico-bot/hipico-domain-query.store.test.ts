import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomainReadLimit, readHipicoDomainAggregate } from './hipico-domain-query.store.js';

const scope={
  ownerId:'11111111-1111-4111-8111-111111111111',
  groupKey:'lab-group-A',
  aggregateKind:'race' as const,
  aggregateKey:'racectx_synthetic_A',
  limit:30
};

test('canonical aggregate and events use one repeatable-read, owner/group-scoped snapshot',async()=>{
  const createdAt=new Date('2026-10-12T10:00:00.000Z');
  const updatedAt=new Date('2026-10-12T11:00:00.000Z');
  const reads:Array<{sql:string;values:unknown[]}>=[];

  // Only the injected test transaction produces synthetic rows. Production
  // uses the real Prisma transaction and its PostgreSQL isolation guarantee.
  const db={
    $transaction:async(run:(tx:any)=>Promise<any>,options:{isolationLevel:string})=>{
      assert.equal(options.isolationLevel,'RepeatableRead');
      return run({
        $queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{
          reads.push({sql:strings.join('?'),values});
          if(reads.length===1)return [{
            status:'RESULT_RECEIVED',stateVersion:2n,createdAt,updatedAt
          }];
          if(reads.length===2)return [{id:'synthetic-event',eventType:'RESULT_RECORDED'}];
          throw new Error('UNEXPECTED_EXTRA_READ');
        }
      });
    }
  } as any;

  const result=await readHipicoDomainAggregate(scope,db);
  assert.equal(result?.aggregate.status,'RESULT_RECEIVED');
  assert.equal(result?.aggregate.stateVersion,2);
  assert.equal(result?.aggregate.updatedAt,updatedAt);
  assert.equal(result?.events.length,1);
  assert.equal(reads.length,2);
  for(const read of reads){
    assert.match(read.sql,/owner_id\s*=/);
    assert.match(read.sql,/group_key\s*=/);
    assert.match(read.sql,/aggregate_kind\s*=/);
    assert.match(read.sql,/aggregate_key\s*=/);
    assert.deepEqual(read.values.slice(0,4),[
      scope.ownerId,scope.groupKey,scope.aggregateKind,scope.aggregateKey
    ]);
  }
  assert.equal(reads[1].values[4],scope.limit);
  assert.match(reads[1].sql,/ORDER BY event_timestamp DESC,id DESC/);
});

test('unknown aggregate does not read unrelated event history',async()=>{
  let reads=0;
  const db={
    $transaction:async(run:(tx:any)=>Promise<any>)=>run({
      $queryRaw:async()=>{reads++;return[];}
    })
  } as any;
  const result=await readHipicoDomainAggregate(scope,db);
  assert.equal(result,null);
  assert.equal(reads,1);
});

test('missing scope and query failures fail closed without partial evidence',async()=>{
  let transactions=0;
  const db={
    $transaction:async(run:(tx:any)=>Promise<any>)=>{
      transactions++;
      return run({$queryRaw:async()=>{throw new Error('DB_UNAVAILABLE');}});
    }
  } as any;
  await assert.rejects(
    readHipicoDomainAggregate({...scope,groupKey:''},db),
    /HIPICO_DOMAIN_READ_SCOPE_REQUIRED/
  );
  assert.equal(transactions,0);
  await assert.rejects(readHipicoDomainAggregate(scope,db),/DB_UNAVAILABLE/);
  assert.equal(transactions,1);
});

test('canonical read limit remains bounded to 1..200',()=>{
  assert.equal(normalizeDomainReadLimit(undefined),50);
  assert.equal(normalizeDomainReadLimit(-3),1);
  assert.equal(normalizeDomainReadLimit(900),200);
  assert.equal(normalizeDomainReadLimit(30.7),30);
});

test('unsafe BIGINT state versions fail closed without returning rounded evidence',async()=>{
  for(const stateVersion of [BigInt(Number.MAX_SAFE_INTEGER)+1n,-1n]){
    let reads=0;
    const db={
      $transaction:async(run:(tx:any)=>Promise<any>)=>run({
        $queryRaw:async()=>{
          reads++;
          if(reads!==1)throw new Error('UNSAFE_VERSION_MUST_NOT_QUERY_EVENTS');
          return [{
            status:'OPEN',stateVersion,
            createdAt:new Date('2026-11-19T10:00:00Z'),
            updatedAt:new Date('2026-11-19T11:00:00Z')
          }];
        }
      })
    } as any;
    await assert.rejects(
      readHipicoDomainAggregate(scope,db),
      /HIPICO_DOMAIN_STATE_VERSION_UNSAFE/
    );
    assert.equal(reads,1);
  }
});
