import attestation from './LEGAL_RELEASE_ATTESTATION.json' with {type:'json'};
import {LEGAL_DOCUMENT_VERSION,legalProvider} from './legalCatalog.js';

const sha256Pattern=/^[a-f0-9]{64}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const placeholderPattern=/replace[_ -]?with|pendiente|placeholder|your[_ -]|changeme|example\.com/i;
const requiredApprovals=[
  'professionalReview','providerIdentity','terms','privacy','cookies','acceptableUse',
  'suspensionTermination','jurisdictionDisputes','billingTaxCurrency','accountingTaxRetention',
  'subprocessorsTransfers','cancellationRefundDelinquency','ipEvidencePolicy','humanHealthAddendum'
] as const;

function normalized(value:unknown){return String(value||'').trim();}
function isRealProviderValue(value:unknown){
  const valueNormalized=normalized(value);
  return Boolean(valueNormalized)&&!/^\[.*\]$/.test(valueNormalized)&&!placeholderPattern.test(valueNormalized);
}
function same(a:unknown,b:unknown){return normalized(a)===normalized(b);}

export function legalProviderIdentityReady(){
  const provider=legalProvider();
  return isRealProviderValue(provider.name)
    &&isRealProviderValue(provider.rif)
    &&isRealProviderValue(provider.address)
    &&isRealProviderValue(provider.legalEmail)
    &&isRealProviderValue(provider.supportEmail)
    &&emailPattern.test(normalized(provider.legalEmail))
    &&emailPattern.test(normalized(provider.supportEmail));
}

export function legalBundledAttestationReady(){
  const provider=legalProvider();
  const approvals=(attestation as any).approvals||{};
  const reviewedAt=Date.parse(normalized((attestation as any).reviewedAt));
  return (attestation as any).schemaVersion===1
    &&(attestation as any).status==='approved'
    &&(attestation as any).legalDocumentVersion===LEGAL_DOCUMENT_VERSION
    &&Number.isFinite(reviewedAt)
    &&Boolean(normalized((attestation as any).reviewer?.name))
    &&/^(VE|Venezuela)$/i.test(normalized((attestation as any).reviewer?.jurisdiction))
    &&Boolean(normalized((attestation as any).evidence?.reference))
    &&sha256Pattern.test(normalized((attestation as any).evidence?.sha256))
    &&same((attestation as any).provider?.name,provider.name)
    &&same((attestation as any).provider?.rif,provider.rif)
    &&same((attestation as any).provider?.address,provider.address)
    &&same((attestation as any).provider?.legalEmail,provider.legalEmail)
    &&same((attestation as any).provider?.supportEmail,provider.supportEmail)
    &&requiredApprovals.every((approval)=>approvals[approval]===true);
}

export function legalProfessionalReviewReady(){
  const approvedVersion=normalized(process.env.LEGAL_REVIEW_APPROVED_VERSION);
  const evidenceSha256=normalized(process.env.LEGAL_REVIEW_EVIDENCE_SHA256);
  const attestationSha256=normalized((attestation as any).evidence?.sha256);
  return approvedVersion===LEGAL_DOCUMENT_VERSION
    &&sha256Pattern.test(evidenceSha256)
    &&evidenceSha256.toLowerCase()===attestationSha256.toLowerCase()
    &&legalBundledAttestationReady();
}

export function legalRuntimeProductionReady(){
  return legalProviderIdentityReady()&&legalProfessionalReviewReady();
}
