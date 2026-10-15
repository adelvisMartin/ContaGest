import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportCommand, reportApiOrigin, main } from '../tools/hipico-cli/report-shares.mjs';

test('CLI accepts only exact safe group, participant and revoke forms',()=>{
  assert.deepEqual(parseReportCommand(['create','triple-c','participant','PERSONA-1','24']),{
    action:'create',groupKey:'triple-c',audience:'participant',participantCode:'PERSONA-1',hours:24
  });
  assert.deepEqual(parseReportCommand(['create','triple-c','group','12']),{
    action:'create',groupKey:'triple-c',audience:'group',hours:12
  });
  assert.deepEqual(parseReportCommand(['list','triple-c']),{action:'list',groupKey:'triple-c'});
  for(const args of [['create','triple-c','participant','X','0'],['create','triple-c','group','169'],
      ['create','triple-c','participant','../../private','1'],['list','../etc'],['unknown'],
      ['revoke','not-uuid'],['create','triple-c','group','4','extra']]){
    assert.throws(()=>parseReportCommand(args));
  }
});

test('CLI rejects origin with credentials, path, token or insecure external HTTP',()=>{
  for(const url of ['http://example.com','https://example.com/private',
    'https://user:password@example.com','https://example.com/?t=SECRET','ftp://example.com']){
    assert.throws(()=>reportApiOrigin(url),url);
  }
  assert.equal(reportApiOrigin('https://hipico.example.com'),'https://hipico.example.com');
  assert.equal(reportApiOrigin('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
});

test('CLI requires local secret before attempting any network operation',async()=>{
  await assert.rejects(
    ()=>main(['list','triple-c'],{HIPICO_REPORT_API_ORIGIN:'https://example.com'}),
    /HIPICO_REPORT_OPERATOR_TOKEN_REQUIRED/
  );
});
