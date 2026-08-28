import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const [client, runtime, sw, vercel, bridge, identity] = await Promise.all([
  read('frontend/public/hipico-control/assets/js/supabase.js'),
  read('frontend/public/hipico-control/runtime-config.js'),
  read('frontend/public/hipico-control/sw.js'),
  read('frontend/vercel.json'),
  read('tools/hipico-whatsapp-web-bridge/src/index.mjs'),
  read('tools/hipico-whatsapp-web-bridge/src/group-identity.mjs')
]);

const findings = [];
function finding(id, severity, area, description, owner) {
  findings.push({ id, severity, area, description, owner, blocksPromotion: ['CRITICAL', 'HIGH'].includes(severity) });
}

if (/SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_/i.test(client + runtime)) {
  finding('H114-001', 'CRITICAL', 'PWA secrets', 'Service-role/secret-like credential reference found in public Hípico client.', '#116');
}

const roleStart = client.indexOf('export function sessionRole');
const roleEnd = client.indexOf('export function isAdminSession', roleStart);
if (client.slice(roleStart, roleEnd).includes('user_metadata')) {
  finding('H114-002', 'CRITICAL', 'authorization', 'Privileged role still trusts user_metadata.', '#116');
}
if (!client.includes('HIPICO_RPC_REQUIRED') || !/"allowLabDirectTableFallback": false/.test(runtime)) {
  finding('H114-003', 'HIGH', 'backend authority', 'Production missing-RPC path is not demonstrably fail-closed.', '#116');
}
if (/send(?:Message|Text|Payload)ToSource\s*\(/i.test(bridge) || !/sourceSendPossible:\s*false/.test(bridge)) {
  finding('H114-004', 'CRITICAL', 'WhatsApp routing', 'SOURCE write route/guard is unsafe.', '#110');
}
if (!bridge.includes('assertCurrentLabIdentity()') || !identity.includes('assertPinnedGroupIdentity')) {
  finding('H114-005', 'CRITICAL', 'WhatsApp routing', 'LAB send is not guarded by pinned identity revalidation.', '#110');
}
if (!/Content-Security-Policy/.test(vercel) || /unsafe-eval/.test(vercel)) {
  finding('H114-006', 'HIGH', 'CSP', 'CSP is missing or allows unsafe-eval.', '#114');
}
if (!/function isSensitive/.test(sw) || !/fetch\(request, \{ cache: 'no-store' \}\)/.test(sw)) {
  finding('H114-007', 'HIGH', 'Service Worker', 'Sensitive same-origin requests are not explicitly network-only/no-store.', '#115');
}

// The legacy live producer is a known HIGH until #112 migrates index.mjs to journal v2.
if (/async function spoolJson\([\s\S]*?fs\.writeFile\(file, JSON\.stringify/.test(bridge)) {
  finding('H114-008', 'HIGH', 'Bridge spool', 'Live runtime still contains legacy direct spool writes; crash/replay guarantees depend on #112 migration.', '#112');
}

let supportBundleState = 'DEPENDENCY_PENDING';
try {
  const obs = await read('tools/hipico-whatsapp-web-bridge/src/observability.mjs');
  supportBundleState = /SUPPORT_FILE_NOT_ALLOWLISTED/.test(obs) && /redactDiagnostic/.test(obs) ? 'PRESENT' : 'INCOMPLETE';
  if (supportBundleState === 'INCOMPLETE') finding('H114-009', 'HIGH', 'diagnostics', 'Support export lacks explicit allow-list/redaction contract.', '#113');
} catch {
  // #113 is a separate stacked workstream. Absence here is represented as dependency state, not fabricated PASS.
}

const blockers = findings.filter((item) => item.blocksPromotion);
const report = {
  schemaVersion: 1,
  ticket: 114,
  status: blockers.length ? 'FAIL' : 'PASS',
  promotion: blockers.length ? 'NO_GO' : 'ELIGIBLE_FOR_NEXT_GATE',
  supportBundleState,
  counts: {
    critical: findings.filter((item) => item.severity === 'CRITICAL').length,
    high: findings.filter((item) => item.severity === 'HIGH').length,
    medium: findings.filter((item) => item.severity === 'MEDIUM').length,
    low: findings.filter((item) => item.severity === 'LOW').length
  },
  findings
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = blockers.length ? 1 : 0;
