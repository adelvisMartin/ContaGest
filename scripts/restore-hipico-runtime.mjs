import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const payloadPath = path.join(root, 'products/hipico-control/runtime/v1.13.0-rc1/runtime.zip.b64');
const target = path.join(root, 'frontend/public/hipico-control');
const expectedSha256 = 'a8c36cb5b101e6be5ea1b52fdca3f89240cf18cb5376d7840b7ab3724924f88d';
const expectedVersion = '1.13.0-parity.1';

const obsolete = [
  'assets/js/app-shell.js',
  'assets/js/operations.js',
  'assets/js/race-finalization.js',
  'assets/js/rc1-recovery.js',
  'assets/js/agent-router.js',
  'assets/css/precision-hipica.css',
  'assets/css/offline-icons.css'
];

function safeRelative(name) {
  if (!name || name.includes('\0') || name.includes('\\')) throw new Error(`Entrada ZIP inválida: ${name}`);
  const normalized = path.posix.normalize(name);
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Path traversal bloqueado: ${name}`);
  }
  return normalized;
}

function extractZip(buffer, destination) {
  let offset = 0;
  let files = 0;
  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`ZIP inválido en offset ${offset}`);
    if (offset + 30 > buffer.length) throw new Error('Cabecera ZIP truncada.');

    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    if (flags & 0x0001) throw new Error('ZIP cifrado no permitido.');
    if (flags & 0x0008) throw new Error('ZIP con data descriptor no soportado por el extractor determinista.');
    if (![0, 8].includes(method)) throw new Error(`Método ZIP no permitido: ${method}`);

    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('Entrada ZIP truncada.');

    const relative = safeRelative(buffer.subarray(nameStart, nameEnd).toString('utf8'));
    const destinationPath = path.resolve(destination, ...relative.split('/'));
    const destinationRoot = `${path.resolve(destination)}${path.sep}`;
    if (!destinationPath.startsWith(destinationRoot)) throw new Error(`Destino fuera del producto: ${relative}`);

    const compressed = buffer.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    if (content.length !== uncompressedSize) throw new Error(`Tamaño inválido: ${relative}`);

    if (relative.endsWith('/')) {
      fs.mkdirSync(destinationPath, { recursive:true });
    } else {
      fs.mkdirSync(path.dirname(destinationPath), { recursive:true });
      fs.writeFileSync(destinationPath, content);
      files += 1;
    }
    offset = dataEnd;
  }
  return files;
}

if (!fs.existsSync(payloadPath)) throw new Error(`Falta payload Hípico: ${payloadPath}`);
const encoded = fs.readFileSync(payloadPath, 'utf8').replace(/\s+/g, '');
const archive = Buffer.from(encoded, 'base64');
const digest = crypto.createHash('sha256').update(archive).digest('hex');
if (digest !== expectedSha256) throw new Error(`SHA-256 Hípico inválido: ${digest}`);

const brandDir = path.join(target, 'assets/brand');
const requiredBrand = ['control-hipico-mark.svg','icon-192.svg','icon-512.svg','maskable-192.svg','maskable-512.svg'];
for (const asset of requiredBrand) {
  if (!fs.existsSync(path.join(brandDir, asset))) {
    throw new Error(`Falta asset de marca versionado: frontend/public/hipico-control/assets/brand/${asset}`);
  }
}

for (const relative of obsolete) fs.rmSync(path.join(target, relative), { force:true });
const count = extractZip(archive, target);

const buildInfo = JSON.parse(fs.readFileSync(path.join(target, 'build-info.json'), 'utf8'));
if (buildInfo.version !== expectedVersion) {
  throw new Error(`Runtime Hípico inesperado: ${buildInfo.version || 'sin versión'}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.webmanifest'), 'utf8'));
if (manifest.scope !== './') throw new Error(`Scope Hípico inválido: ${manifest.scope}`);

console.log(`Control Hípico ${buildInfo.version} restaurado (${count} archivos, sha256 ${digest.slice(0,12)}…).`);
