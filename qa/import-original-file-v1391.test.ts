import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const sha256=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const run='QA1391-'+randomUUID().slice(0,12);
const eicar='X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-'+'STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const raw=(name:string,body:string)=>({method:'POST',headers:{'Content-Type':'application/octet-stream','X-Import-Filename':name},body});

test('real HTTP, PostgreSQL and ClamAV: scanned file provenance, commit integrity and historical payable read',async(t)=>{
  const h=await createRealBackendHarness();
  const names=['json','csv','tsv','txt','tamper','malware','invalid'].map(ext=>run+'-'+ext+'.'+(ext==='tamper'||ext==='malware'||ext==='invalid'?'json':ext));
  const rifs=['JSON','CSV','TSV','TXT','TAMPER'].map(s=>run+'-'+s);
  const ids:string[]=[];
  let tenantB:string|undefined;
  t.after(async()=>{
    try {
      await h.prisma.client.deleteMany({where:{tenantId:h.tenant.id,rif:{in:rifs}}});
      const batches=await h.prisma.importBatch.findMany({where:{tenantId:h.tenant.id,filename:{in:names}},select:{id:true}});
      const batchIds=batches.map(b=>b.id);
      await h.prisma.idempotencyRecord.deleteMany({where:{tenantId:h.tenant.id,scope:{in:batchIds.map(id=>'imports.commit.'+id)}}});
      await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,entity:'ImportBatch',entityId:{in:batchIds}}});
      await h.prisma.importBatch.deleteMany({where:{tenantId:h.tenant.id,id:{in:batchIds}}});
      for(const id of ids)await h.prisma.$executeRaw`DELETE FROM public."PayableDocument" WHERE "id"=${id}`;
      if(tenantB)await h.prisma.tenant.delete({where:{id:tenantB}});
    } finally { await h.close(); }
  });
  const path='/imports/preview-file?type=clients&duplicatePolicy=error';
  const contents=[
    JSON.stringify([{rif:rifs[0],name:'Cliente JSON QA'}]),
    'rif,name\n'+rifs[1]+',Cliente CSV QA\n',
    'rif\tname\n'+rifs[2]+'\tCliente TSV QA\n',
    'rif\tname\n'+rifs[3]+'\tCliente TXT QA\n'
  ];
  for(let i=0;i<contents.length;i++){
    const batch=await h.ok(path,raw(names[i],contents[i]));
    assert.equal(batch.status,'validated');
    assert.equal(batch.sourceSha256,sha256(contents[i]));
    assert.equal(batch.rows[0].row.rif,rifs[i]);
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:rifs[i]}}),0);
    const completed=await h.ok('/imports/'+batch.id+'/commit',{method:'POST',headers:{'Idempotency-Key':run+'-'+i+'-commit-000000'},body:JSON.stringify({confirm:true,checksum:batch.checksum})});
    assert.equal(completed.status,'completed');
    assert.equal(completed.sourceSha256,sha256(contents[i]));
    assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:rifs[i]}}),1);
  }

  const tampered=await h.ok(path,raw(names[4],JSON.stringify([{rif:rifs[4],name:'Cliente QA'}])));
  const stored=await h.prisma.importBatch.findFirstOrThrow({where:{tenantId:h.tenant.id,id:tampered.id}});
  const payload=structuredClone(stored.payload) as any;
  payload.sourceSha256='0'.repeat(64);
  await h.prisma.importBatch.update({where:{id:stored.id},data:{payload}});
  const denied=await h.status('/imports/'+tampered.id+'/commit',409,{method:'POST',headers:{'Idempotency-Key':run+'-tamper-000000'},body:JSON.stringify({confirm:true,checksum:tampered.checksum})});
  assert.equal(denied.payload.code||denied.payload.details?.code,'IMPORT_SOURCE_INTEGRITY_MISMATCH');
  assert.equal(await h.prisma.client.count({where:{tenantId:h.tenant.id,rif:rifs[4]}}),0);

  assert.equal(eicar.length,68);
  const blocked=await h.status(path,422,raw(names[5],eicar));
  assert.equal(blocked.payload.code||blocked.payload.details?.code,'EXTERNAL_FILE_MALWARE_DETECTED');
  await h.status(path,422,raw(names[6],'{'));
  assert.equal(await h.prisma.importBatch.count({where:{tenantId:h.tenant.id,filename:{in:names.slice(5)}}}),0);

  // Synthetic legacy originals, inserted only into this disposable database.
  tenantB=(await h.prisma.tenant.create({data:{rif:run+'-B',name:'QA historical B',legalName:'QA historical B'}})).id;
  async function legacy(tenantId:string,bytes:Buffer,hash=sha256(bytes)){
    const id=randomUUID();ids.push(id);
    await h.prisma.$executeRaw`INSERT INTO public."PayableDocument" ("id","tenantId","documentHash","fileName","mimeType","sizeBytes","originalContent") VALUES (${id},${tenantId},${hash},${run+'.pdf'},'application/pdf',${bytes.length},${bytes})`;
    return id;
  }
  const benign=Buffer.from('%PDF-1.4\n%%EOF\n');
  const clean=await legacy(h.tenant.id,benign);
  const infected=await legacy(h.tenant.id,Buffer.from(eicar));
  const corrupt=await legacy(h.tenant.id,Buffer.from('different original'), 'f'.repeat(64));
  const foreign=await legacy(tenantB,benign);
  const downloaded=await h.request('/payables/documents/'+clean+'/content');
  assert.equal(downloaded.response.status,200);
  assert.equal(downloaded.response.headers.get('etag'),'"sha256-'+sha256(benign)+'"');
  const infectedResult=await h.status('/payables/documents/'+infected+'/content',422);
  assert.equal(infectedResult.payload.code||infectedResult.payload.details?.code,'EXTERNAL_FILE_MALWARE_DETECTED');
  const corruptResult=await h.status('/payables/documents/'+corrupt+'/content',422);
  assert.equal(corruptResult.payload.code||corruptResult.payload.details?.code,'PAYABLE_CONTENT_INTEGRITY_FAILED');
  await h.status('/payables/documents/'+foreign+'/content',404);
  const originals=await h.prisma.$queryRaw<Array<{count:bigint}>>`SELECT count(*)::bigint AS count FROM public."PayableDocument" WHERE "id" IN (${clean},${infected},${corrupt},${foreign})`;
  assert.equal(Number(originals[0].count),4,'historical records must remain intact after denial');
});
