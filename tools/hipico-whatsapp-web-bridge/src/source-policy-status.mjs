import { loadRuntimeConfig, VERSION } from './runtime-config.mjs';
import { policyDiagnostic } from './source-policy-gate.mjs';

const config = loadRuntimeConfig(process.env, process.cwd());
const { transport, sourcePolicy } = policyDiagnostic(config);

const payload = {
  version: VERSION,
  runtimeMode: config.runtimeMode,
  transport: {
    id: transport.id,
    official: transport.official,
    implemented: transport.implemented,
    sourceRead: transport.sourceRead,
    labSend: transport.labSend,
    groupSend: transport.groupSend,
    receipts: transport.receipts,
    media: transport.media
  },
  lab: {
    sendRequested: config.labSendEnabled,
    inputRequested: config.labTestInputEnabled,
    technicallyAvailable: transport.implemented && transport.labSend
  },
  sourcePolicy: {
    requested: sourcePolicy.requested,
    eligible: sourcePolicy.eligible,
    status: sourcePolicy.status,
    policyCode: sourcePolicy.policyCode,
    snapshot: sourcePolicy.snapshot,
    policyReference: sourcePolicy.policyReference,
    reasons: sourcePolicy.reasons
  }
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exitCode = sourcePolicy.requested && !sourcePolicy.eligible ? 2 : 0;
