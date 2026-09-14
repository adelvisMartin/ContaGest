import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const envSource=fs.readFileSync('backend/src/config/env.ts','utf8');
const securitySource=fs.readFileSync('backend/src/shared/middleware/security.ts','utf8');

test('Vercel preview cannot derive auth/license secrets from public deployment metadata',()=>{
  assert.doesNotMatch(envSource,/const previewSeed\s*=/);
  assert.doesNotMatch(envSource,/derivedPreviewJwtSecret/);
  assert.doesNotMatch(envSource,/derivedPreviewLicenseSecret/);
  assert.doesNotMatch(envSource,/preview-derived/);
  assert.match(envSource,/Public deployment metadata/);
});

test('Vercel preview fails closed when no private JWT/license seed is available',()=>{
  assert.match(securitySource,/isVercelPreview && \(!jwtSecretReady \|\| !licenseSecretReady\)/);
  assert.match(securitySource,/seguridad del preview no está configurada/i);
  assert.match(securitySource,/semilla privada/i);
});
