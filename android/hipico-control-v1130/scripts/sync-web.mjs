import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.resolve(here, '..');
const repo = path.resolve(wrapper, '../..');
const source = path.resolve(repo, 'frontend/public/hipico-control');
const target = path.resolve(wrapper, 'www');
const releasePolicy = JSON.parse(fs.readFileSync(path.join(repo, 'products/hipico-control/release-policy.json'), 'utf8'));
const expectedVersion = releasePolicy.version;
const checkOnly = process.argv.includes('--check-only');
const required = [
  'index.html', 'recovery.html', 'manifest.webmanifest', 'sw.js', 'runtime-config.js', 'build-info.json',
  'logo-control-hipico.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png',
  'assets/css/app.css',
  'assets/js/app.js', 'assets/js/store.js', 'assets/js/supabase.js', 'assets/js/local-auth.js', 'assets/js/ui.js',
  'assets/js/password-recovery.js', 'assets/js/user-access.js', 'assets/js/help-center.js',
  'assets/js/whatsapp.js', 'assets/js/whatsapp/normalization.js', 'assets/js/whatsapp/parser.js', 'assets/js/whatsapp/ui-transcript.js'
];
const forbiddenLegacy = [
  'assets/css/styles.css', 'assets/css/ui-system.css', 'assets/css/tokens.css', 'assets/css/themes.css',
  'assets/css/components.css', 'assets/css/operations-pro.css', 'assets/css/precision-hipica.css',
  'assets/css/offline-icons.css', 'assets/css/recovery.css', 'assets/css/ui-system-v2.css', 'icon.svg'
];

function assertInside(candidate, parent, label) {
  const relative = path.relative(parent, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} fuera del directorio permitido: ${candidate}`);
}
function filesUnder(root) {
  const output = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(path.relative(root, absolute).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return output.sort();
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function verifyRuntime(root, label) {
  for (const relative of required) {
    const file = path.resolve(root, relative);
    assertInside(file, root, `${label}/${relative}`);
    if (!fs.existsSync(file)) throw new Error(`${label}: falta ${relative}`);
  }
  for (const relative of forbiddenLegacy) if (fs.existsSync(path.resolve(root, relative))) throw new Error(`${label}: permanece asset legacy ${relative}`);
  const cssFiles = filesUnder(path.join(root, 'assets/css')).filter((file) => file.endsWith('.css'));
  if (cssFiles.length !== 1 || cssFiles[0] !== 'app.css') throw new Error(`${label}: assets/css debe contener únicamente app.css; encontrados ${cssFiles.join(', ')}`);
  const buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  if (buildInfo.version !== expectedVersion) throw new Error(`${label}: versión ${buildInfo.version || 'desconocida'}; se esperaba ${expectedVersion}`);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (/<link[^>]*>\s*>/i.test(index)) throw new Error(`${label}: HTML contiene un cierre de link duplicado.`);
  if (!index.includes('./assets/js/app.js')) throw new Error(`${label}: app.js no está enlazado de forma portable.`);
  if (!index.includes('./assets/css/app.css')) throw new Error(`${label}: app.css no está enlazado.`);
  if (!index.includes('./assets/js/help-center.js')) throw new Error(`${label}: help-center.js no está enlazado.`);
  if (/styles\.css|ui-system|tokens\.css|themes\.css|operations-pro|precision-hipica|recovery\.css/i.test(index)) throw new Error(`${label}: index todavía carga una autoridad visual retirada.`);
  return filesUnder(root);
}
function verifyParity(sourceFiles, targetFiles) {
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) throw new Error('La lista de archivos Android no coincide con la PWA canónica. Ejecuta npm run sync:web.');
  for (const relative of sourceFiles) {
    const sourceHash = sha256(path.join(source, relative));
    const targetHash = sha256(path.join(target, relative));
    if (sourceHash !== targetHash) throw new Error(`Paridad Android/PWA rota en ${relative}`);
  }
}

if (!fs.existsSync(source)) throw new Error(`No existe la PWA canónica: ${source}`);
const sourceFiles = verifyRuntime(source, 'PWA');
if (!checkOnly) {
  assertInside(target, wrapper, 'www');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}
if (!fs.existsSync(target)) throw new Error('No existe www. Ejecuta npm run sync:web antes de verificar.');
const targetFiles = verifyRuntime(target, 'Android www');
verifyParity(sourceFiles, targetFiles);
console.log(`Control Hípico ${expectedVersion}: paridad web/Android zero-legacy verificada (${sourceFiles.length} archivos).`);
