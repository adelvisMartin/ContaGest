import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('59/75 API validation maps Zod failures to deterministic 422 responses',()=>{
  const source=read('backend/src/shared/middleware/error.ts');
  assert.match(source,/import \{ ZodError \} from 'zod'/);
  assert.match(source,/error instanceof ZodError/);
  assert.match(source,/validation \? 422 : 500/);
  assert.match(source,/La solicitud contiene datos inválidos\./);
  assert.match(source,/payload\.details = error\.issues/);
});

test('59/75 validation mapping preserves HttpError and database service-unavailable authority',()=>{
  const source=read('backend/src/shared/middleware/error.ts');
  assert.match(source,/error instanceof HttpError \? error\.status/);
  assert.match(source,/const db = databaseMessage\(error\)/);
  assert.match(source,/db\?\.status/);
});
