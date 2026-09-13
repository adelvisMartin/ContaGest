export const DOMAIN_RISK_CATALOG = Object.freeze([
  {
    id:'accounting-financial', severity:'critical',
    patterns:[/backend\/src\/modules\/(accounting|banking|fiscal|payroll|inventory|sales|purchases)/,/backend\/prisma\//,/frontend\/src\/pages\/(Ledger|GeneralLedger|TrialBalance|Worksheet|FinancialStatements|AccountingClose|Banking|Payroll|Taxes|SalesBook|Purchases|Sales)Page/],
    agents:['ERP Accounting','DBRE','Backend/API','QA'],
    skills:['contagest-accounting-integrity','contagest-tenant-isolation-rbac','contagest-secure-verification'],
    gates:['typecheck','unit','db-integration','api','tenant-negative','idempotency','browser']
  },
  {
    id:'identity-tenant-rbac', severity:'critical',
    patterns:[/backend\/src\/modules\/(auth|rbac|commercial-access|license)/,/frontend\/src\/(services\/accessControlService|pages\/(AdminPanel|Licenses|Login|Profile)Page)/,/backend\/prisma\//],
    agents:['IAM/AppSec','DBRE','Backend/API','QA','Red Team'],
    skills:['contagest-tenant-isolation-rbac','contagest-appsec-review','contagest-secure-verification'],
    gates:['typecheck','unit','db-integration','api','tenant-negative','browser','security']
  },
  {
    id:'database-migration', severity:'critical',
    patterns:[/backend\/prisma\//,/supabase\/sql\//,/migrations?\//],
    agents:['DBRE','Backend/API','QA','BCP/DR'],
    skills:['contagest-db-migration-safety','contagest-bcp-dr','contagest-release-evidence'],
    gates:['from-zero-db','upgrade-fixture','constraints','rls','backup-restore-plan']
  },
  {
    id:'control-hipico', severity:'critical',
    patterns:[
      /backend\/src\/modules\/hipico(?:-bot)?\//,
      /frontend\/api\/hipico\//,
      /frontend\/public\/hipico-control\//,
      /tools\/hipico-whatsapp-(?:web-)?bridge\//,
      /supabase\/sql\/hipico_/,
      /tests\/hipico/i,
      /qa\/.*hipico/i,
      /scripts\/hipico-/,
      /docs\/hipico\//
    ],
    agents:['Hípico Orchestrator','WhatsApp Reliability','Document Intelligence','Backend/API','DBRE','AppSec','SRE/Release','QA','Human Operator'],
    skills:['contagest-hipico-safe-automation','contagest-appsec-review','contagest-systematic-debugging','contagest-release-evidence','contagest-secure-verification'],
    gates:['typecheck','unit','api','db-integration','multi-group-isolation','source-read-only','bridge-replay','document-security','document-provenance','provider-failure','race-idempotency','2000-isolation','build','deployment-sha','physical-119','soak-120','rollback']
  },
  {
    id:'frontend-shell-design', severity:'high',
    patterns:[/frontend\/index\.html/,/frontend\/src\/components\/(layout|ui|toast|modal)/,/frontend\/src\/styles\//,/frontend\/src\/app\.js/,/qa\/.*visual/],
    agents:['Frontend/PWA','ERP UX','Design Systems/A11y','QA'],
    skills:['contagest-ui-audit','contagest-functional-module-audit','contagest-systematic-debugging'],
    gates:['visual-source-strict','visual-contracts','browser-visual','browser-deep','mobile-360-390-430']
  },
  {
    id:'health-sensitive', severity:'critical',
    patterns:[/frontend\/src\/pages\/(Healthcare|Veterinary|Psychology|Dentistry)/,/verticals?\/health/,/health/i],
    agents:['Health Workflow','Privacy','AppSec','Frontend/PWA','Backend/API','QA'],
    skills:['contagest-functional-module-audit','contagest-tenant-isolation-rbac','contagest-appsec-review'],
    gates:['unit','api','tenant-negative','browser','privacy-review']
  },
  {
    id:'pwa-offline', severity:'high',
    patterns:[/service-worker|sw\.js|manifest\.webmanifest|pwa/i,/frontend\/src\/state\//,/frontend\/src\/services\/backendApi/],
    agents:['Frontend/PWA','AppSec','QA','SRE'],
    skills:['contagest-secure-verification','contagest-systematic-debugging','contagest-release-evidence'],
    gates:['browser','refresh','back-forward','offline','cache-version','tenant-cache-isolation']
  },
  {
    id:'integrations', severity:'high',
    patterns:[/backend\/src\/modules\/(currency|notifications|maps|ai)/,/frontend\/src\/services\/(bcv|vertical|backendApi)/i],
    agents:['Backend/API','Integration Reliability','AppSec','QA'],
    skills:['contagest-secure-verification','contagest-appsec-review'],
    gates:['timeouts','retry-backoff','provider-failure','rate-limit','no-secret-client','integration-tests']
  },
  {
    id:'release-infrastructure', severity:'critical',
    patterns:[/\.github\/workflows\//,/vercel/i,/Dockerfile|docker-compose|deploy\//,/package(-lock)?\.json/],
    agents:['SRE/Release','AppSec','QA'],
    skills:['contagest-release-evidence','contagest-bcp-dr','contagest-secure-verification'],
    gates:['dependency-audit','build','artifact-hash','deployment-sha','rollback']
  }
]);

export function gatesForFiles(files=[]) {
  return DOMAIN_RISK_CATALOG.filter((domain)=>files.some((file)=>domain.patterns.some((pattern)=>pattern.test(file))));
}
