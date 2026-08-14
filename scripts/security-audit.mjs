import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git','node_modules','dist','coverage','playwright-report','test-results','.agents/vendor']);
const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.yml','.yaml','.html','.css','.env','.example']);
const findings = [];

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
  if (!textExtensions.has(ext) && !rel.endsWith('.env.example')) return;
  const content = fs.readFileSync(full, 'utf8');

  const secretPatterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
    ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['jwt-literal', /JWT_SECRET\s*=\s*(?!replace_|change_|process\.env|\$\{|['"]?\s*$)[^\s#]{20,}/i],
    ['supabase-service-role-literal', /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!replace_|process\.env|\$\{|['"]?\s*$)[^\s#]{20,}/i]
  ];
  for (const [kind, pattern] of secretPatterns) if (pattern.test(content)) findings.push(`${kind}: ${rel}`);

  if (rel.startsWith('frontend/')) {
    const forbiddenClientSecrets = /\b(?:SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|JWT_SECRET|WHATSAPP_CLOUD_TOKEN|LICENSE_HASH_SECRET)\b/;
    if (forbiddenClientSecrets.test(content)) findings.push(`server-secret-name-in-frontend: ${rel}`);
    const viteSecret = /\bVITE_[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE|OPENAI|TOKEN)[A-Z0-9_]*\b/;
    if (viteSecret.test(content)) findings.push(`unsafe-vite-secret-name: ${rel}`);
  }
}

walk(root);

const gitignore = fs.readFileSync(path.join(root,'.gitignore'),'utf8');
for (const rule of ['.env','frontend/.env','backend/.env']) {
  if (!gitignore.includes(rule)) findings.push(`gitignore-missing: ${rule}`);
}

const securityPath = path.join(root,'backend/src/shared/middleware/security.ts');
const security = fs.existsSync(securityPath) ? fs.readFileSync(securityPath,'utf8') : '';
for (const control of ['globalRateLimit','authRateLimit','csrfProtection','corsPolicy','enforceProductionSecrets']) {
  if (!security.includes(control)) findings.push(`security-control-missing: ${control}`);
}

const validationPath = path.join(root,'backend/src/shared/middleware/validate.ts');
const validation = fs.existsSync(validationPath) ? fs.readFileSync(validationPath,'utf8') : '';
if (!validation.includes('safeParse')) findings.push('validation-control-missing: zod-safeParse');

if (findings.length) {
  console.error('ContaGest security baseline: FAIL');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('ContaGest security baseline: PASS');
console.log('- no obvious committed secret material detected');
console.log('- frontend does not reference server-only secret names');
console.log('- env files are ignored');
console.log('- global/auth rate limits, CSRF, CORS and production-secret gates are present');
console.log('- server-side schema validation uses safeParse');
