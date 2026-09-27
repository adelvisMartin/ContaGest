import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('backend/src/modules/media/media.routes.ts', 'utf8');

test('#569 signed media URLs use canonical paths and object authorization', () => {
  assert.match(source, /const SIGNABLE_ENTITY_TYPES = new Set\(\['care-patient', 'gym-member', 'profile', 'company'\]\)/);
  assert.match(source, /function parseAuthorizedMediaPath\(path: string, tenantId: string\)/);
  assert.match(source, /segments\.length !== 4/);
  assert.match(source, /!SIGNABLE_ENTITY_TYPES\.has\(entityType\)/);
  assert.match(source, /body\.paths\.map\(\(path\) => parseAuthorizedMediaPath\(path, context\.tenantId\)\)/);
  assert.match(source, /await authorize\(req, target\.entityType, target\.entityId\)/);
});

test('#569 generic signing cannot fall back to clinical or unknown resource paths', () => {
  assert.doesNotMatch(source, /const prefix = `\$\{context\.tenantId\}\//);
  assert.match(source, /El tipo de recurso no admite firmado mediante el endpoint genérico/);
  assert.match(source, /La ruta del archivo no tiene el formato canónico esperado/);
  assert.match(source, /La ruta del archivo contiene segmentos no permitidos/);
});
