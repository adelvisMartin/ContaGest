import { LOCAL_SCHEMA_VERSION, createSnapshot, saveLocalWorkspace } from './store.js';

export const BACKUP_SCHEMA_VERSION = 2;
const KDF_ITERATIONS = 250000;
const SECRET_KEY = /token|secret|cookie|authorization|session|qr|service.?role|private.?key|password|signed.?url/i;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
export function sha256Sync(input) {
  const bytes = new TextEncoder().encode(String(input));
  const length = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength); data.set(bytes); data[bytes.length] = 0x80;
  const view = new DataView(data.buffer); view.setUint32(paddedLength - 4, length >>> 0, false); view.setUint32(paddedLength - 8, Math.floor(length / 2 ** 32), false);
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset=0; offset<data.length; offset+=64) {
    for (let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4,false);
    for (let i=16;i<64;i++) { const s0=rotr(7,w[i-15])^rotr(18,w[i-15])^(w[i-15]>>>3); const s1=rotr(17,w[i-2])^rotr(19,w[i-2])^(w[i-2]>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0; }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i=0;i<64;i++) { const S1=rotr(6,e)^rotr(11,e)^rotr(25,e); const ch=(e&f)^((~e)&g); const t1=(h+S1+ch+K[i]+w[i])>>>0; const S0=rotr(2,a)^rotr(13,a)^rotr(22,a); const maj=(a&b)^(a&c)^(b&c); const t2=(S0+maj)>>>0; h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map((n)=>n.toString(16).padStart(8,'0')).join('');
}

export function stripBackupSecrets(value, key = '') {
  if (SECRET_KEY.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => stripBackupSecrets(item)).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const safe = stripBackupSecrets(childValue, childKey);
      if (safe !== undefined) out[childKey] = safe;
    }
    return out;
  }
  return value;
}

export function createBackupObject(workspace, { productVersion = 'unknown', createdAt = new Date().toISOString() } = {}) {
  const sanitized = stripBackupSecrets(structuredClone(workspace));
  const content = stable(sanitized);
  const manifest = {
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    localSchemaVersion: LOCAL_SCHEMA_VERSION,
    productVersion,
    createdAt,
    contentSha256: sha256Sync(content),
    encryptionRequiredOffDevice: true,
    excluded: ['auth/session/token/cookie/qr/service-role/private-key/password/signed-url'],
    includes: ['workspace/business-history/settings-contained-in-workspace/evidence-contained-in-workspace']
  };
  return { ...sanitized, _backup: manifest };
}

export function serializeWorkspaceBackup(workspace, options = {}) { return JSON.stringify(createBackupObject(workspace, options), null, 2); }
export function backupFilename(dateIso) { return `hipico-control-${String(dateIso || 'respaldo')}.json`; }

function workspacePayload(parsed) {
  if (parsed?.workspace && parsed?._backup) return parsed.workspace;
  const copy = structuredClone(parsed || {}); delete copy._backup; delete copy._encryptedBackup; return copy;
}
export function validateBackupObject(parsed, { maxLocalSchemaVersion = LOCAL_SCHEMA_VERSION } = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('El respaldo no contiene un workspace válido.'), { code: 'HIPICO_BACKUP_INVALID' });
  if (!parsed._backup) {
    const legacyWorkspace = stripBackupSecrets(structuredClone(parsed));
    return { legacy: true, workspace: legacyWorkspace, manifest: null, warnings: ['LEGACY_UNHASHED_BACKUP'] };
  }
  const manifest = parsed._backup;
  if (Number(manifest.backupSchemaVersion) > BACKUP_SCHEMA_VERSION || Number(manifest.localSchemaVersion || 1) > maxLocalSchemaVersion) throw Object.assign(new Error('El respaldo fue creado por una versión incompatible.'), { code: 'HIPICO_BACKUP_SCHEMA_INCOMPATIBLE' });
  const workspace = workspacePayload(parsed);
  const sanitizedWorkspace = stripBackupSecrets(workspace);
  const actual = sha256Sync(stable(sanitizedWorkspace));
  if (actual !== manifest.contentSha256) throw Object.assign(new Error('El respaldo fue alterado o está corrupto.'), { code: 'HIPICO_BACKUP_HASH_MISMATCH' });
  return { legacy: false, workspace: sanitizedWorkspace, manifest, warnings: [] };
}

function bytesToBase64(bytes) { let binary=''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value) { const binary=atob(value); return Uint8Array.from(binary, (char)=>char.charCodeAt(0)); }
async function deriveKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
export async function encryptBackupText(plainText, passphrase) {
  if (String(passphrase || '').length < 12) throw Object.assign(new Error('La contraseña del respaldo debe tener al menos 12 caracteres.'), { code:'HIPICO_BACKUP_PASSPHRASE_WEAK' });
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12)); const key=await deriveKey(passphrase,salt); const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(plainText));
  return JSON.stringify({ _encryptedBackup:{ schemaVersion:1, algorithm:'AES-GCM-256', kdf:'PBKDF2-SHA256', iterations:KDF_ITERATIONS, salt:bytesToBase64(salt), iv:bytesToBase64(iv), ciphertext:bytesToBase64(new Uint8Array(cipher)) } }, null, 2);
}
export async function decryptBackupText(encryptedText, passphrase) {
  const parsed=JSON.parse(encryptedText); const meta=parsed?._encryptedBackup; if(!meta || meta.algorithm!=='AES-GCM-256' || meta.kdf!=='PBKDF2-SHA256') throw Object.assign(new Error('Formato de respaldo cifrado no soportado.'),{code:'HIPICO_BACKUP_ENCRYPTION_UNSUPPORTED'});
  const salt=base64ToBytes(meta.salt), iv=base64ToBytes(meta.iv), cipher=base64ToBytes(meta.ciphertext); const key=await deriveKey(passphrase,salt,Number(meta.iterations||KDF_ITERATIONS));
  try { const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher); return new TextDecoder().decode(plain); } catch (error) { throw Object.assign(new Error('Contraseña incorrecta o respaldo cifrado alterado.'),{code:'HIPICO_BACKUP_DECRYPT_FAILED',cause:error}); }
}
export async function parsePortableBackup(text, { passphrase } = {}) {
  const initial=JSON.parse(String(text||''));
  const plain=initial?._encryptedBackup ? await decryptBackupText(text,passphrase) : text;
  return validateBackupObject(JSON.parse(plain));
}

export function reconcileRestoredWorkspace(workspace) {
  const duplicates=[]; const collections=['participants','days','races','advancedBets','movements','exchangeRates','weekClosures','pollas','audit'];
  for(const name of collections){ const seen=new Set(); for(const row of workspace?.[name]||[]){ if(!row?.id) continue; if(seen.has(row.id)) duplicates.push(`${name}:${row.id}`); seen.add(row.id); } }
  const invalidMoney=[]; for(const movement of workspace?.movements||[]){ if(movement?.amount!=null && !Number.isFinite(Number(movement.amount))) invalidMoney.push(movement.id||'movement'); }
  return { ok: duplicates.length===0 && invalidMoney.length===0, duplicateIds:duplicates, invalidMoney, note:'Server append-only ledger reconciliation remains authoritative for monetary release.' };
}

async function readPrimaryWorkspace() {
  const db=await new Promise((resolve,reject)=>{ const request=indexedDB.open('hipico-control'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
  try { const tx=db.transaction('workspaces','readonly'); const value=await new Promise((resolve,reject)=>{ const request=tx.objectStore('workspaces').get('primary'); request.onsuccess=()=>resolve(request.result?.workspace||null); request.onerror=()=>reject(request.error); }); return value; } finally { db.close(); }
}
export async function exportEncryptedCurrentWorkspace({ passphrase, productVersion='unknown' }={}) { const workspace=await readPrimaryWorkspace(); if(!workspace) throw new Error('No existe un workspace local para respaldar.'); return encryptBackupText(serializeWorkspaceBackup(workspace,{productVersion}),passphrase); }
export async function restorePortableBackup(text,{passphrase,confirmReplace=false}={}) {
  if(!confirmReplace) throw Object.assign(new Error('Restore requiere confirmación explícita antes de reemplazar datos.'),{code:'HIPICO_RESTORE_CONFIRMATION_REQUIRED'});
  const parsed=await parsePortableBackup(text,{passphrase}); const reconciliation=reconcileRestoredWorkspace(parsed.workspace); if(!reconciliation.ok) throw Object.assign(new Error('El respaldo no reconcilia y fue rechazado.'),{code:'HIPICO_BACKUP_RECONCILIATION_FAILED',reconciliation});
  const current=await readPrimaryWorkspace(); if(current) await createSnapshot(current,'antes-de-restore-portable');
  await saveLocalWorkspace(parsed.workspace,{snapshot:false});
  return { workspace:structuredClone(parsed.workspace), manifest:parsed.manifest, legacy:parsed.legacy, reconciliation };
}
