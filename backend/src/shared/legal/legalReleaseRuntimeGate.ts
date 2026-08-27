import {LEGAL_DOCUMENT_VERSION,legalProductionReady} from './legalCatalog.js';

const sha256Pattern=/^[a-f0-9]{64}$/i;

export function legalProfessionalReviewReady(){
  const approvedVersion=String(process.env.LEGAL_REVIEW_APPROVED_VERSION||'').trim();
  const evidenceSha256=String(process.env.LEGAL_REVIEW_EVIDENCE_SHA256||'').trim();
  return approvedVersion===LEGAL_DOCUMENT_VERSION&&sha256Pattern.test(evidenceSha256);
}

export function legalRuntimeProductionReady(){
  return legalProductionReady()&&legalProfessionalReviewReady();
}
