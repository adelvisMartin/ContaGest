import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git','node_modules','dist','coverage','playwright-report','test-results','.agents/vendor','artifacts']);
const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.yml','.yaml','.html','.css','.env','.example','.ps1','.cmd','Dockerfile']);
const findings = [];

function isBrowserFrontendPath(rel) {
  return rel.startsWith('frontend/src/')
    || rel.startsWith('frontend/public/')
    || rel === 'frontend/index.html'
    || rel.startsWith('frontend/soluciones/')
    || rel.startsWith('frontend/portal/');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\','/');
    if (entry.isDirectory()) walk(full);
    else inspect(full, rel);
  }
}

function inspect(full, rel) {
  const ext = path.extname(full);
  const basename = path.basename(full);
  if (!textExtensions.has(ext) && !textExtensions.has(basename) && !rel.endsWith('.env.example')) return;
  const content = fs.readFileSync(full, 'utf8');

  const secretPatterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
    ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['jwt-literal', /(?<![A-Z0-9_])JWT_SECRET\s*=\s*(?!replace_|change_|process\.env|\$\{|['"]?\s*$)[^\s#]{20,}/i],
    ['supabase-service-role-literal', /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!replace_|process\.env|\$\{|['"]?\s*$)[^\s#]{20,}/i],
    ['hipico-bridge-token-literal', /HIPICO_GROUP_BRIDGE_TOKEN[ \t]*=[ \t]*[A-Za-z0-9_-]{32,}/i]
  ];
  for (const [kind, pattern] of secretPatterns) if (pattern.test(content)) findings.push(`${kind}: ${rel}`);

  if (isBrowserFrontendPath(rel)) {
    const forbiddenClientSecretAccess = /(?:import\.meta\.env|process\.env)\.(?:SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|JWT_SECRET|WHATSAPP_CLOUD_TOKEN|LICENSE_HASH_SECRET|HIPICO_GROUP_BRIDGE_TOKEN)\b/;
    if (forbiddenClientSecretAccess.test(content)) findings.push(`server-secret-access-in-frontend: ${rel}`);
    const viteSecret = /\bVITE_[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE|OPENAI|TOKEN)[A-Z0-9_]*\b/;
    if (viteSecret.test(content)) findings.push(`unsafe-vite-secret-name: ${rel}`);
  }

  if (/\.env\.example$/.test(rel) || /deploy\/.+\/bridge\.env\.example$/.test(rel)) {
    if (/HIPICO_SOURCE_GROUP_ID\s*=\s*\d{5,}-\d+@g\.us/i.test(content)) findings.push(`committed-source-group-id: ${rel}`);
    if (/HIPICO_LAB_GROUP_ID\s*=\s*\d{5,}-\d+@g\.us/i.test(content)) findings.push(`committed-lab-group-id: ${rel}`);
  }
}

walk(root);

const gitignore = fs.readFileSync(path.join(root,'.gitignore'),'utf8');
for (const rule of ['.env','frontend/.env','backend/.env','bridge.env']) {
  if (!gitignore.includes(rule)) findings.push(`gitignore-missing: ${rule}`);
}

const securityPath = path.join(root,'backend/src/shared/middleware/security.ts');
const security = fs.existsSync(securityPath) ? fs.readFileSync(securityPath,'utf8') : '';
for (const control of ['globalRateLimit','authRateLimit','cspReportRateLimit','csrfProtection','corsPolicy','enforceProductionSecrets','collectCspReport']) {
  if (!security.includes(control)) findings.push(`security-control-missing: ${control}`);
}

const appPath = path.join(root,'backend/src/app.ts');
const app = fs.existsSync(appPath) ? fs.readFileSync(appPath,'utf8') : '';
if (!app.includes('/api/v1/security/csp-report')) findings.push('csp-report-endpoint-missing');
if (!app.includes("limit: '32kb'")) findings.push('csp-report-body-limit-missing');

const vercelPath = path.join(root,'vercel.json');
const vercel = fs.existsSync(vercelPath) ? fs.readFileSync(vercelPath,'utf8') : '';
if (!vercel.includes('Content-Security-Policy-Report-Only')) findings.push('csp-report-only-header-missing');
if (!vercel.includes('report-uri /api/v1/security/csp-report')) findings.push('csp-report-uri-missing');
if (!vercel.includes('camera=(self)') || !vercel.includes('geolocation=(self)')) findings.push('pwa-permissions-policy-misaligned');

const validationPath = path.join(root,'backend/src/shared/middleware/validate.ts');
const validation = fs.existsSync(validationPath) ? fs.readFileSync(validationPath,'utf8') : '';
if (!validation.includes('safeParse')) findings.push('validation-control-missing: zod-safeParse');

const pwaInstallPath = path.join(root,'frontend/public/pwa-install.js');
const pwaInstall = fs.existsSync(pwaInstallPath) ? fs.readFileSync(pwaInstallPath,'utf8') : '';
if (/\.innerHTML\s*=/.test(pwaInstall)) findings.push('pwa-install-dom-sink: innerHTML');
if (/createElement\(['"]style['"]\)/.test(pwaInstall)) findings.push('pwa-install-runtime-style-injection');

const bridgeRoot = path.join(root,'tools/hipico-whatsapp-web-bridge');
const bridgeConfigPath = path.join(bridgeRoot,'src/runtime-config.mjs');
const bridgeConfig = fs.existsSync(bridgeConfigPath) ? fs.readFileSync(bridgeConfigPath,'utf8') : '';
for (const contract of ['HIPICO_REQUIRE_PINNED_GROUP_IDS','HIPICO_SOURCE_GROUP_ID','HIPICO_LAB_GROUP_ID','isWhatsAppGroupId']) {
  if (!bridgeConfig.includes(contract)) findings.push(`hipico-group-binding-contract-missing: ${contract}`);
}
for (const envRel of [
  'tools/hipico-whatsapp-web-bridge/.env.example',
  'tools/hipico-whatsapp-web-bridge/deploy/linux/bridge.env.example',
  'tools/hipico-whatsapp-web-bridge/deploy/docker/bridge.env.example'
]) {
  const file = path.join(root, envRel);
  if (!fs.existsSync(file)) {
    findings.push(`hipico-env-template-missing: ${envRel}`);
    continue;
  }
  const value = fs.readFileSync(file,'utf8');
  if (!/HIPICO_LAB_SEND_ENABLED=false/.test(value)) findings.push(`hipico-lab-send-default-not-off: ${envRel}`);
  if (!/HIPICO_LAB_TEST_INPUT_ENABLED=false/.test(value)) findings.push(`hipico-lab-input-default-not-off: ${envRel}`);
  if (!/HIPICO_REQUIRE_PINNED_GROUP_IDS=true/.test(value)) findings.push(`hipico-group-pinning-not-required: ${envRel}`);
}

const dockerfilePath = path.join(bridgeRoot,'deploy/docker/Dockerfile');
const dockerfile = fs.existsSync(dockerfilePath) ? fs.readFileSync(dockerfilePath,'utf8') : '';
if (!/USER\s+10001:10001/.test(dockerfile)) findings.push('hipico-docker-nonroot-user-missing');
const composePath = path.join(bridgeRoot,'deploy/docker/compose.yaml');
const compose = fs.existsSync(composePath) ? fs.readFileSync(composePath,'utf8') : '';
for (const guard of ['read_only: true','cap_drop:','no-new-privileges:true']) {
  if (!compose.includes(guard)) findings.push(`hipico-docker-hardening-missing: ${guard}`);
}

if (findings.length) {
  console.error('ContaGest security baseline: FAIL');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('ContaGest security baseline: PASS');
console.log('- no obvious committed secret material detected');
console.log('- frontend does not access server-only secret values');
console.log('- env/runtime binding files are ignored');
console.log('- global/auth/CSP rate limits, CSRF, CORS and production-secret gates are present');
console.log('- server-side schema validation uses safeParse');
console.log('- strict CSP is collecting violations in Report-Only mode');
console.log('- PWA installer avoids innerHTML and runtime style injection');
console.log('- Control Hípico LAB is fail-safe by default and requires pinned group IDs');
console.log('- hosted Docker worker is non-root and capability-restricted');
