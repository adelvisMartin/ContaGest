import { getSetting, setSetting } from './store.js';

const ENROLLMENT_KEY = 'localAdminEnrollmentV2';
const PBKDF2_ITERATIONS = 310000;
const MIN_LOCAL_PASSWORD_LENGTH = 12;

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const value = String(hex || '');
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g).map((part) => Number.parseInt(part, 16)));
}

function constantTimeEqual(left, right) {
  const a = left instanceof Uint8Array ? left : new Uint8Array(left || []);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right || []);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}

function requireCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues || typeof TextEncoder !== 'function') {
    throw new Error('Este dispositivo no admite el acceso sin conexión protegido.');
  }
}

async function sha256Text(value) {
  requireCrypto();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(digest);
}

async function deriveVerifier(password, salt, iterations = PBKDF2_ITERATIONS) {
  requireCrypto();
  const material = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password || '')), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256
  );
  return new Uint8Array(bits);
}

export async function hasLocalAdminEnrollment() {
  const record = await getSetting(ENROLLMENT_KEY, null);
  return Boolean(record?.version === 2 && record?.emailHash && record?.salt && record?.verifier);
}

export async function enrollLocalAdmin(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Escribe un correo válido.');
  if (String(password || '').length < MIN_LOCAL_PASSWORD_LENGTH) throw new Error(`La contraseña debe tener al menos ${MIN_LOCAL_PASSWORD_LENGTH} caracteres.`);
  requireCrypto();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(password, salt);
  const record = {
    version: 2,
    algorithm: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    emailHash: await sha256Text(normalizedEmail),
    salt: bytesToHex(salt),
    verifier: bytesToHex(verifier),
    enrolledAt: new Date().toISOString()
  };
  await setSetting(ENROLLMENT_KEY, record);
  return { enrolled: true, enrolledAt: record.enrolledAt };
}

export async function clearLocalAdminEnrollment() {
  await setSetting(ENROLLMENT_KEY, null);
}

export async function verifyLocalAdmin(email, password) {
  const record = await getSetting(ENROLLMENT_KEY, null);
  if (!record?.emailHash || !record?.salt || !record?.verifier) return false;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!constantTimeEqual(hexToBytes(await sha256Text(normalizedEmail)), hexToBytes(record.emailHash))) return false;
  const verifier = await deriveVerifier(password, hexToBytes(record.salt), Number(record.iterations || PBKDF2_ITERATIONS));
  return constantTimeEqual(verifier, hexToBytes(record.verifier));
}

export const __test__ = { bytesToHex, hexToBytes, constantTimeEqual, deriveVerifier, PBKDF2_ITERATIONS, MIN_LOCAL_PASSWORD_LENGTH };
