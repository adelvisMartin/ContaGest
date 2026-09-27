const domain = ({ id, severity, patterns, agents, agentIds, skills, gates }) => Object.freeze({ id, severity, patterns, agents, agentIds, skills, gates });

export const DOMAIN_RISK_CATALOG = Object.freeze([
  domain({
    id:'accounting-financial', severity:'critical',
    patterns:[/backend\/src\/modules\/(accounting|banking|fiscal|payroll|inventory|sales|purchases)/,/backend\/prisma\//,/frontend\/src\/pages\/(Ledger|GeneralLedger|TrialBalance|Worksheet|FinancialStatements|AccountingClose|Banking|Payroll|Taxes|SalesBook|Purchases|Sales)Page/],
    agents:['ERP Accounting','DBRE','Backend/API','QA'], agentIds:['accounting','dbre','backend-api','qa-release'],
    skills:['contagest-accounting-integrity','contagest-tenant-isolation-rbac','contagest-secure-verification'],
    gates:['typecheck','unit','db-integration','api','tenant-negative','idempotency','browser']
  }),
  domain({
    id:'identity-tenant-rbac', severity:'critical',
    patterns:[/backend\/src\/modules\/(auth|rbac|commercial-access|license)/,/frontend\/src\/(services\/accessControlService|pages\/(AdminPanel|Licenses|Login|Profile)Page)/,/backend\/prisma\//],
    agents:['IAM/AppSec','DBRE','Backend/API','QA','Red Team'], agentIds:['appsec-iam','dbre','backend-api','qa-release'],
    skills:['contagest-tenant-isolation-rbac','contagest-appsec-review','contagest-secure-verification'],
    gates:['typecheck','unit','db-integration','api','tenant-negative','browser','security']
  }),
  domain({
    id:'database-migration', severity:'critical',
    patterns:[/backend\/prisma\//,/supabase\/sql\//,/migrations?\//],
    agents:['DBRE','Backend/API','QA','BCP/DR'], agentIds:['dbre','backend-api','qa-release'],
    skills:['contagest-db-migration-safety','contagest-bcp-dr','contagest-release-evidence'],
    gates:['from-zero-db','upgrade-fixture','constraints','rls','backup-restore-plan']
  }),
  domain({
    id:'frontend-shell-design', severity:'high',
    patterns:[/frontend\/index\.html/,/frontend\/src\/components\/(layout|ui|toast|modal)/,/frontend\/src\/styles\//,/frontend\/src\/app\.js/,/qa\/.*visual/],
    agents:['Frontend/PWA','ERP UX','Design Systems/A11y','QA'], agentIds:['frontend-pwa-ux','qa-release'],
    skills:['contagest-ui-audit','contagest-functional-module-audit','contagest-systematic-debugging'],
    gates:['visual-source-strict','visual-contracts','browser-visual','browser-deep','mobile-360-390-430']
  }),
  domain({
    id:'health-sensitive', severity:'critical',
    patterns:[/frontend\/src\/pages\/(Healthcare|Veterinary|Psychology|Dentistry)/,/verticals?\/health/,/health/i],
    agents:['Health Workflow','Privacy','AppSec','Frontend/PWA','Backend/API','QA'], agentIds:['appsec-iam','frontend-pwa-ux','backend-api','qa-release'],
    skills:['contagest-functional-module-audit','contagest-tenant-isolation-rbac','contagest-appsec-review'],
    gates:['unit','api','tenant-negative','browser','privacy-review']
  }),
  domain({
    id:'pwa-offline', severity:'high',
    patterns:[/service-worker|sw\.js|manifest\.webmanifest|pwa/i,/frontend\/src\/state\//,/frontend\/src\/services\/backendApi/],
    agents:['Frontend/PWA','AppSec','QA','SRE'], agentIds:['frontend-pwa-ux','appsec-iam','qa-release'],
    skills:['contagest-secure-verification','contagest-systematic-debugging','contagest-release-evidence'],
    gates:['browser','refresh','back-forward','offline','cache-version','tenant-cache-isolation']
  }),
  domain({
    id:'integrations', severity:'high',
    patterns:[/backend\/src\/modules\/(currency|notifications|maps|ai)/,/frontend\/src\/services\/(bcv|vertical|backendApi)/i],
    agents:['Backend/API','Integration Reliability','AppSec','QA'], agentIds:['backend-api','appsec-iam','qa-release'],
    skills:['contagest-secure-verification','contagest-appsec-review'],
    gates:['timeouts','retry-backoff','provider-failure','rate-limit','no-secret-client','integration-tests']
  }),
  domain({
    id:'release-infrastructure', severity:'critical',
    patterns:[/\.github\/workflows\//,/vercel/i,/Dockerfile|docker-compose|deploy\//,/package(-lock)?\.json/],
    agents:['SRE/Release','AppSec','QA'], agentIds:['qa-release','appsec-iam'],
    skills:['contagest-release-evidence','contagest-bcp-dr','contagest-secure-verification'],
    gates:['dependency-audit','build','artifact-hash','deployment-sha','rollback']
  }),
  domain({
    id:'agent-system', severity:'critical',
    patterns:[/^AGENTS\.md$/,/^\.agents\//,/^agent-skills\.lock\.json$/,/^scripts\/agent-/,/^scripts\/[^/]*skill[^/]*$/,/^qa\/support\/domain-risk-catalog\.mjs$/],
    agents:['Agent Orchestrator','IAM/AppSec','QA/Release'], agentIds:['orchestrator','appsec-iam','qa-release'],
    skills:['contagest-erp-orchestrator','contagest-secure-verification','contagest-release-evidence'],
    gates:['agent-contracts','skill-contract-v2','router-v2','duplicate-work-claims','exact-sha-evidence']
  }),
  domain({
    id:'hipico-automation', severity:'critical',
    patterns:[/hipico/i,/whatsapp/i,/outbox/i,/receipt/i,/reconcil/i,/spool/i],
    agents:['Hípico Reliability','IAM/AppSec','Backend/API','QA/Release'], agentIds:['hipico-reliability','appsec-iam','backend-api','qa-release'],
    skills:['contagest-secure-verification','contagest-release-evidence','contagest-systematic-debugging'],
    gates:['hipico-contracts','replay','duplicate-effect','outbox-reconcile','restart-reconnect','source-lab-boundary']
  }),
  domain({
    id:'data-lifecycle', severity:'critical',
    patterns:[/data[-_/]lifecycle/i,/retention/i,/archive/i,/legal[-_/]hold/i,/purge/i],
    agents:['DBRE','IAM/AppSec','QA/Release'], agentIds:['dbre','appsec-iam','qa-release'],
    skills:['contagest-db-migration-safety','contagest-bcp-dr','contagest-secure-verification'],
    gates:['retention-contracts','tenant-negative','restore','audit-evidence']
  }),
  domain({
    id:'api-governance', severity:'high',
    patterns:[/backend\/src\/modules\/api/i,/api[-_/]contract/i,/openapi/i,/versioning/i,/idempotency/i,/deprecat/i],
    agents:['Backend/API','IAM/AppSec','QA/Release'], agentIds:['backend-api','appsec-iam','qa-release'],
    skills:['contagest-secure-verification','contagest-tenant-isolation-rbac','contagest-release-evidence'],
    gates:['api-contracts','error-contracts','idempotency','deprecation','tenant-negative']
  }),
  domain({
    id:'observability', severity:'high',
    patterns:[/observability/i,/telemetry/i,/tracing/i,/opentelemetry/i,/slo/i,/sli/i,/error[-_/]budget/i],
    agents:['Backend/API','QA/Release','IAM/AppSec'], agentIds:['backend-api','qa-release','appsec-iam'],
    skills:['contagest-secure-verification','contagest-release-evidence'],
    gates:['correlation','redaction','telemetry-contracts','slo-sli']
  }),
  domain({
    id:'supply-chain', severity:'critical',
    patterns:[/supply[-_/]chain/i,/sbom/i,/provenance/i,/dependabot/i,/agent-skills\.lock\.json/,/package-lock\.json/],
    agents:['IAM/AppSec','QA/Release'], agentIds:['appsec-iam','qa-release'],
    skills:['contagest-appsec-review','contagest-secure-verification','contagest-release-evidence'],
    gates:['dependency-audit','sbom','provenance','pinned-actions','reproducible-artifact']
  }),
  domain({
    id:'vertical-runtime', severity:'high',
    patterns:[/vertical[-_/]runtime/i,/qa\/.*vertical/i,/frontend\/src\/pages\/(Dentistry|Gym|Veterinary)/i,/backend\/src\/modules\/(dentistry|gym|veterinary)/i],
    agents:['Frontend/PWA','Backend/API','QA/Release','IAM/AppSec'], agentIds:['frontend-pwa-ux','backend-api','qa-release','appsec-iam'],
    skills:['contagest-functional-module-audit','contagest-ui-audit','contagest-tenant-isolation-rbac'],
    gates:['browser-runtime','api','tenant-negative','loading-error-empty','mobile-desktop']
  }),
  domain({
    id:'privacy-sensitive', severity:'critical',
    patterns:[/privacy/i,/sensitive/i,/health/i,/clinical/i,/patient/i,/psychology/i,/dentistry/i,/veterinary/i],
    agents:['IAM/AppSec','Backend/API','Frontend/PWA','QA/Release'], agentIds:['appsec-iam','backend-api','frontend-pwa-ux','qa-release'],
    skills:['contagest-appsec-review','contagest-tenant-isolation-rbac','contagest-secure-verification'],
    gates:['least-privilege','tenant-negative','export-scope','audit-redaction','privacy-review']
  })
]);

export function gatesForFiles(files=[]) {
  return DOMAIN_RISK_CATALOG.filter((entry)=>files.some((file)=>entry.patterns.some((pattern)=>pattern.test(file))));
}
