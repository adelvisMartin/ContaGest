import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLabTestReplyJournal} from '../src/lab-test-reply-journal.mjs';
import {parseLabAckReportArgs,runLabAckReport} from '../src/lab-ack-report.mjs';

const LAB='120363222222222222@g.us';
const SOURCE='120363111111111111@g.us';
const OTHER='120363333333333333@g.us';
const directory=path.dirname(fileURLToPath(import.meta.url));

async function fixture(){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'hipico-ack-report-'));
  const rootDir=path.join(dataDir,'lab-test-replies');
  const make=(labGroupId=LAB)=>createLabTestReplyJournal({
    rootDir,labGroupId,sourceGroupId:SOURCE,now:()=>Date.UTC(2026,9,12,12,0,0)
  });
  const env={HIPICO_DATA_DIR:dataDir,HIPICO_LAB_GROUP_ID:LAB,HIPICO_SOURCE_GROUP_ID:SOURCE};
  return{dataDir,rootDir,make,env,clean:()=>fs.rm(dataDir,{recursive:true,force:true})};
}

test('read-only inventory returns bounded redacted rows and counts without touching journal bytes',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    await j.prepare('message-id:private-phone-5555555');
    await j.begin('message-id:private-phone-5555555');
    await j.markAmbiguous('message-id:private-phone-5555555');
    await j.prepare('second-private');
    await j.begin('second-private');
    await j.confirm('second-private',{visibleTag:true});
    const names=(await fs.readdir(f.rootDir)).sort();
    const before=await Promise.all(names.map(name=>fs.readFile(path.join(f.rootDir,name),'utf8')));
    const result=await runLabAckReport({env:f.env,argv:['--state=ambiguous','--limit=1','--check']});
    assert.equal(result.exitCode,2);
    const report=result.report;
    assert.equal(report.mode,'READ_ONLY');
    assert.equal(report.releaseGate,'NOT_EVALUATED');
    assert.equal(report.sourceWriteAllowed,false);
    assert.equal(report.status,'REVIEW_REQUIRED');
    assert.deepEqual(report.counts,{prepared:0,sending:0,confirmed:1,ambiguous:1});
    assert.equal(report.reviewRequired,1);
    assert.equal(report.selectedCount,1);
    assert.equal(report.truncated,false);
    assert.equal(report.rows.length,1);
    assert.match(report.rows[0].recordRef,/^[a-f0-9]{16}$/);
    assert.match(report.rows[0].tag,/^\[LABTEST:[a-f0-9]{10}\]$/);
    assert.equal(report.rows[0].state,'ambiguous');
    assert.doesNotMatch(JSON.stringify(report),/private-phone|5555555|second-private|@g\.us|Bearer|HIPICO_DATA_DIR|\/tmp\//);
    assert.deepEqual(await Promise.all(names.map(name=>fs.readFile(path.join(f.rootDir,name),'utf8'))),before);
  }finally{await f.clean();}
});

test('bounded limit only trims result rows, never aggregate state counts',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    for(let i=0;i<4;i++){
      const id='message-'+i;
      await j.prepare(id);await j.begin(id);await j.markAmbiguous(id);
    }
    const {report}=await runLabAckReport({env:f.env,argv:['--limit=2']});
    assert.equal(report.selectedCount,4);
    assert.equal(report.returnedCount,2);
    assert.equal(report.truncated,true);
    assert.equal(report.counts.ambiguous,4);
    assert.equal(report.reviewRequired,4);
  }finally{await f.clean();}
});

test('no ambiguous records is not reported as production QA PASS',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    await j.prepare('confirmed');
    await j.begin('confirmed');
    await j.confirm('confirmed',{visibleTag:true});
    const {report,exitCode}=await runLabAckReport({env:f.env,argv:['--check']});
    assert.equal(exitCode,0);
    assert.equal(report.status,'NO_AMBIGUOUS_RECORDS');
    assert.equal(report.releaseGate,'NOT_EVALUATED');
    assert.equal(report.counts.confirmed,1);
  }finally{await f.clean();}
});

test('missing journal is a failure and does not create directories when inspected',async()=>{
  const f=await fixture();
  try{
    await assert.rejects(()=>runLabAckReport({env:f.env}),/LAB_TEST_JOURNAL_MISSING/);
    await assert.rejects(()=>fs.stat(f.rootDir),{code:'ENOENT'});
  }finally{await f.clean();}
});

test('group pin mismatch rejects access and does not rewrite any existing records',async()=>{
  const f=await fixture();
  try{
    const j=f.make();await j.prepare('private-record');
    const files=await fs.readdir(f.rootDir);
    const file=path.join(f.rootDir,files[0]);
    const bytes=await fs.readFile(file,'utf8');
    await assert.rejects(()=>runLabAckReport({env:{...f.env,HIPICO_LAB_GROUP_ID:OTHER}}),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    await assert.rejects(()=>runLabAckReport({env:{...f.env,HIPICO_LAB_GROUP_ID:SOURCE}}),/LAB_TEST_REPORT_GROUP_PINS_REQUIRED/);
    await assert.rejects(()=>runLabAckReport({env:{...f.env,HIPICO_SOURCE_GROUP_ID:''}}),/LAB_TEST_REPORT_GROUP_PINS_REQUIRED/);
    assert.equal(await fs.readFile(file,'utf8'),bytes);
  }finally{await f.clean();}
});

test('corrupt, unknown, or symlink files fail closed without returning partial clean inventory',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    const row=await j.prepare('record-with-corruption');
    const file=path.join(f.rootDir,row.record.idHash+'.json');
    const original=await fs.readFile(file,'utf8');
    await fs.writeFile(file,'{malformed');
    await assert.rejects(()=>j.inspectReadOnly(),/LAB_TEST_JOURNAL_RECORD_INVALID/);
    assert.equal(await fs.readFile(file,'utf8'),'{malformed');
    await fs.writeFile(file,original);
    await fs.writeFile(path.join(f.rootDir,'unexpected.json'),'{}');
    await assert.rejects(()=>j.inspectReadOnly(),/LAB_TEST_JOURNAL_FILE_INVALID/);
    await fs.rm(path.join(f.rootDir,'unexpected.json'));
    if(process.platform!=='win32'){
      await fs.symlink(file,path.join(f.rootDir,'a'.repeat(64)+'.json'));
      await assert.rejects(()=>j.inspectReadOnly(),/LAB_TEST_JOURNAL_FILE_INVALID/);
    }
  }finally{await f.clean();}
});

test('report argument parser refuses arbitrary paths, unexpected commands, duplicate or unbounded queries',()=>{
  assert.deepEqual(parseLabAckReportArgs([]),{state:'all',limit:50,check:false});
  assert.deepEqual(parseLabAckReportArgs(['--state=ambiguous','--limit=100','--check']),{state:'ambiguous',limit:100,check:true});
  for(const args of [
    ['--dir=/etc/secret'],['--execute'],['--replay'],['--limit=10000'],
    ['--limit=0'],['--limit=1e1'],['--state=money'],
    ['--check','--check'],['--limit=1','--limit=2'],['--source']
  ])assert.throws(()=>parseLabAckReportArgs(args),/LAB_TEST_REPORT_/);
});

test('CLI emits only sanitized JSON and uses exit code 2 as review-required alert',async()=>{
  const f=await fixture();
  try{
    const j=f.make();
    await j.prepare('lab-input-123');
    await j.begin('lab-input-123');
    await j.markAmbiguous('lab-input-123');
    const script=path.join(directory,'..','src','lab-ack-report.mjs');
    const result=spawnSync(process.execPath,[script,'--state=ambiguous','--check'],{
      env:{...process.env,...f.env},encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,2,result.stderr);
    const report=JSON.parse(result.stdout);
    assert.equal(report.status,'REVIEW_REQUIRED');
    assert.equal(report.rows[0].state,'ambiguous');
    assert.equal(report.reviewRequired,1);
    assert.doesNotMatch(result.stdout,/120363|lab-input-123|HIPICO_GROUP_BRIDGE_TOKEN/);
    const bad=spawnSync(process.execPath,[script,'--dir=/tmp/private'],{
      env:{...process.env,...f.env},encoding:'utf8',timeout:15000
    });
    assert.equal(bad.status,1);
    assert.equal(bad.stdout,'');
    assert.deepEqual(JSON.parse(bad.stderr),{ok:false,code:'LAB_TEST_REPORT_ARG_INVALID'});
  }finally{await f.clean();}
});
