export type WhatsAppComplianceEvidence={
  reviewedAt:string;
  decision:'GO'|'NO_GO';
  decisionReason:string;
  jurisdiction:{status:'CONFIRMED'|'UNCONFIRMED';country:string|null;requiredBeforeReconsideration:boolean};
  flow:{nature:string;activities:string[];regulatedActivity:boolean};
  candidateChannels:Array<{channel:string;groupWriteCapability:string;policyStatus:string}>;
  officialSources:Array<{url:string;title:string;finding:string}>;
  reconsiderationRequirements:string[];
  safeAlternative:string;
};

export type ComplianceGateInput={
  evidence:WhatsAppComplianceEvidence;
  exactConnector:string;
  platformCapabilityAuthorized:boolean;
  policyPermitsIntendedUse:boolean;
  jurisdictionConfirmed:boolean;
  requiredApprovalsObtained:boolean;
  candidateSha?:string|null;
};

export type ComplianceGateResult={
  decision:'GO'|'NO_GO';
  reasons:string[];
  reviewedAt:string;
  connector:string;
  candidateSha:string|null;
};

export function evaluateWhatsAppProductionCompliance(input:ComplianceGateInput):ComplianceGateResult{
  const reasons:string[]=[];
  if(input.evidence.decision!=='GO')reasons.push('EVIDENCE_DECISION_NO_GO');
  if(!input.exactConnector.trim())reasons.push('CONNECTOR_NOT_IDENTIFIED');
  if(!input.platformCapabilityAuthorized)reasons.push('PLATFORM_CAPABILITY_NOT_AUTHORIZED');
  if(!input.policyPermitsIntendedUse)reasons.push('INTENDED_USE_PROHIBITED_OR_NOT_PROVEN_PERMITTED');
  if(!input.jurisdictionConfirmed)reasons.push('JURISDICTION_UNCONFIRMED');
  if(!input.requiredApprovalsObtained)reasons.push('REQUIRED_APPROVALS_NOT_OBTAINED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.evidence.reviewedAt))reasons.push('EVIDENCE_REVIEW_DATE_INVALID');
  const ageMs=Date.now()-Date.parse(`${input.evidence.reviewedAt}T00:00:00Z`);
  if(!Number.isFinite(ageMs)||ageMs>30*24*60*60*1000)reasons.push('POLICY_EVIDENCE_STALE_OVER_30_DAYS');
  return{decision:reasons.length?'NO_GO':'GO',reasons,reviewedAt:input.evidence.reviewedAt,connector:input.exactConnector,candidateSha:input.candidateSha||null};
}

export function assertWhatsAppProductionGo(result:ComplianceGateResult){
  if(result.decision!=='GO')throw Object.assign(new Error(`WhatsApp production NO-GO: ${result.reasons.join(', ')}`),{code:'HIPICO_WHATSAPP_PRODUCTION_NO_GO',reasons:result.reasons});
  return true;
}
