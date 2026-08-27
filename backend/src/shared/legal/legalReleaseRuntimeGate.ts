import {LEGAL_DOCUMENT_VERSION,legalProvider} from './legalCatalog.js';

const sha256Pattern=/^[a-f0-9]{64}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const placeholderPattern=/replace[_ -]?with|pendiente|placeholder|your[_ -]|changeme|example\.com/i;

function isRealProviderValue(value:unknown){
  const normalized=String(value||'').trim();
  return Boolean(normalized)&&!/^\[.*\]$/.test(normalized)&&!placeholderPattern.test(normalized);
}

export function legalProviderIdentityReady(){
  const provider=legalProvider();
  return isRealProviderValue(provider.name)
    &&isRealProviderValue(provider.rif)
    &&isRealProviderValue(provider.address)
    &&isRealProviderValue(provider.legalEmail)
    &&isRealProviderValue(provider.supportEmail)
    &&emailPattern.test(String(provider.legalEmail||'').trim())
    &&emailPattern.test(String(provider.supportEmail||'').trim());
}

export function legalProfessionalReviewReady(){
  const approvedVersion=String(process.env.LEGAL_REVIEW_APPROVED_VERSION||'').trim();
  const evidenceSha256=String(process.env.LEGAL_REVIEW_EVIDENCE_SHA256||'').trim();
  return approvedVersion===LEGAL_DOCUMENT_VERSION&&sha256Pattern.test(evidenceSha256);
}

export function legalRuntimeProductionReady(){
  return legalProviderIdentityReady()&&legalProfessionalReviewReady();
}
