import crypto from 'node:crypto';

export type HipicoMode = 'shadow' | 'assisted' | 'production';
export type GateState = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_EXECUTED';
export type ComplianceState = 'GO' | 'NO_GO' | 'BLOCKED' | 'NOT_EXECUTED';

export type PromotionEvidence = {
  candidateSha: string;
  physicalQa119: GateState;
  soak120: GateState;
  security114: GateState;
  conversationAppsec153: GateState;
  whatsappCompliance154: ComplianceState;
  approval?: { approved: boolean; actor?: string | null; reason?: string | null; at?: string | null } | null;
};

export type PromotionDecision = {
  requestedMode: HipicoMode;
  effectiveMode: HipicoMode;
  allowed: boolean;
  sourceWrite: boolean;
  monetaryWrite: boolean;
  reasons: string[];
  auditId: string;
};

const SHA40 = /^[a-f0-9]{40}$/i;

export function promotionAuditId(evidence: PromotionEvidence, requestedMode: HipicoMode) {
  const material = [requestedMode, evidence.candidateSha, evidence.approval?.actor || '', evidence.approval?.at || ''].join('|');
  return `promo_${crypto.createHash('sha256').update(material).digest('hex').slice(0, 24)}`;
}

function allPass(evidence: PromotionEvidence) {
  return [evidence.physicalQa119, evidence.soak120, evidence.security114, evidence.conversationAppsec153].every((value) => value === 'PASS');
}

export function evaluatePromotion(requestedMode: HipicoMode, evidence: PromotionEvidence, killSwitchActive = false): PromotionDecision {
  const reasons: string[] = [];
  if (killSwitchActive) reasons.push('LOCAL_KILL_SWITCH_ACTIVE');
  if (!SHA40.test(evidence.candidateSha || '')) reasons.push('CANDIDATE_SHA_NOT_BOUND');

  if (requestedMode === 'shadow') {
    return { requestedMode, effectiveMode: 'shadow', allowed: true, sourceWrite: false, monetaryWrite: false, reasons, auditId: promotionAuditId(evidence, requestedMode) };
  }

  if (!allPass(evidence)) reasons.push('P0_P1_EVIDENCE_NOT_GREEN');
  if (!evidence.approval?.approved || !String(evidence.approval.actor || '').trim() || !String(evidence.approval.reason || '').trim()) {
    reasons.push('EXPLICIT_APPROVAL_MISSING');
  }

  if (requestedMode === 'production' && evidence.whatsappCompliance154 !== 'GO') reasons.push('WHATSAPP_COMPLIANCE_NOT_GO');

  const allowed = reasons.length === 0;
  const effectiveMode: HipicoMode = allowed ? requestedMode : 'shadow';
  return {
    requestedMode,
    effectiveMode,
    allowed,
    sourceWrite: allowed && requestedMode === 'production',
    monetaryWrite: false,
    reasons,
    auditId: promotionAuditId(evidence, requestedMode)
  };
}

export function resolveConfiguredMode(env: NodeJS.ProcessEnv = process.env): HipicoMode {
  const raw = String(env.HIPICO_OPERATION_MODE || 'shadow').trim().toLowerCase();
  return raw === 'assisted' || raw === 'production' ? raw : 'shadow';
}

export function productionCapabilityEnabled(decision: PromotionDecision) {
  return decision.allowed && decision.effectiveMode === 'production' && decision.sourceWrite && !decision.monetaryWrite;
}
