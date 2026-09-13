import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMetaReceipts, safeReceiptMetadata } from './hipico-meta-receipts.js';

function payload(statuses:any[]){
  return{entry:[{changes:[{value:{metadata:{phone_number_id:'1234567890'},statuses}}]}]};
}

test('Meta receipts: extracts supported delivery states with provider identity',()=>{
  const rows=extractMetaReceipts(payload([
    {id:'wamid.1',status:'sent',timestamp:'1789342200',recipient_id:'584121234567'},
    {id:'wamid.1',status:'delivered',timestamp:'1789342201',recipient_id:'584121234567'},
    {id:'wamid.1',status:'read',timestamp:'1789342202',recipient_id:'584121234567'},
    {id:'wamid.2',status:'failed',timestamp:'1789342203',recipient_id:'584121234568',errors:[{code:131047,title:'secret-ish title'}]}
  ]));
  assert.deepEqual(rows.map((row)=>row.status),['sent','delivered','read','failed']);
  assert.equal(rows[0].phoneNumberId,'1234567890');
  assert.equal(rows[3].errorCode,'131047');
  assert.equal(rows[3].providerMessageId,'wamid.2');
});

test('Meta receipts: rejects malformed ids timestamps recipients and unknown states',()=>{
  const rows=extractMetaReceipts(payload([
    {id:'',status:'sent',timestamp:'1789342200',recipient_id:'584121234567'},
    {id:'wamid.bad',status:'queued',timestamp:'1789342200',recipient_id:'584121234567'},
    {id:'wamid.bad',status:'sent',timestamp:'not-time',recipient_id:'584121234567'},
    {id:'wamid.bad',status:'sent',timestamp:'1789342200',recipient_id:'abc'}
  ]));
  assert.equal(rows.length,0);
});

test('Meta receipts: public metadata is minimal and excludes provider free text',()=>{
  const metadata=safeReceiptMetadata({status:'failed',recipient_id:'584121234567',errors:[{code:131047,title:'credential data',message:'do not expose'}]});
  assert.deepEqual(metadata,{recipientId:'584121234567',providerErrorCode:'131047'});
  assert.equal(JSON.stringify(metadata).includes('credential'),false);
  assert.equal(JSON.stringify(metadata).includes('do not expose'),false);
});
