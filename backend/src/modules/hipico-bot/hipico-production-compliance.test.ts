import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertWhatsAppProductionGo, evaluateWhatsAppProductionCompliance, type WhatsAppComplianceEvidence } from './hipico-production-compliance.js';
import { DisabledProductionTransport, LabMemoryTransport, assertProductionTransportAuthorized } from './hipico-whatsapp-transport.js';

const evidence=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),'../products/hipico-control/whatsapp-production-evidence.json'),'utf8')) as WhatsAppComplianceEvidence;

test('current official evidence keeps production NO-GO',()=>{
  const result=evaluateWhatsAppProductionCompliance({evidence,exactConnector:'personal WhatsApp Web browser automation',platformCapabilityAuthorized:false,policyPermitsIntendedUse:false,jurisdictionConfirmed:false,requiredApprovalsObtained:false,candidateSha:'a'.repeat(40)});
  assert.equal(result.decision,'NO_GO');
  assert.ok(result.reasons.includes('INTENDED_USE_PROHIBITED_OR_NOT_PROVEN_PERMITTED'));
  assert.ok(result.reasons.includes('PLATFORM_CAPABILITY_NOT_AUTHORIZED'));
  assert.throws(()=>assertWhatsAppProductionGo(result),/NO-GO/);
});

test('Lab transport refuses assisted/production',async()=>{
  const lab=new LabMemoryTransport();
  const message={destinationKey:'lab',text:'hola',sourceMessageId:'m1',responseIdempotencyKey:'r1',mode:'production' as const};
  const result=await lab.send(message);
  assert.equal(result.accepted,false);
  assert.equal(lab.sent.length,0);
});

test('disabled production transport cannot silently send',async()=>{
  const transport=new DisabledProductionTransport();
  const result=await transport.send({destinationKey:'source',text:'hola',sourceMessageId:'m1',responseIdempotencyKey:'r1',mode:'production'});
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'PRODUCTION_TRANSPORT_NO_GO');
  assert.throws(()=>assertProductionTransportAuthorized(transport),/autorizado/i);
});

test('gate requires every external condition even if evidence were later changed to GO',()=>{
  const future={...evidence,decision:'GO' as const,jurisdiction:{status:'CONFIRMED' as const,country:'TEST',requiredBeforeReconsideration:false}};
  const result=evaluateWhatsAppProductionCompliance({evidence:future,exactConnector:'authorized-adapter',platformCapabilityAuthorized:true,policyPermitsIntendedUse:true,jurisdictionConfirmed:true,requiredApprovalsObtained:false});
  assert.equal(result.decision,'NO_GO');
  assert.ok(result.reasons.includes('REQUIRED_APPROVALS_NOT_OBTAINED'));
});
