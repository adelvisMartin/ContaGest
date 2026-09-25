import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const routeDir='backend/src/modules/verticals';
const routeFiles=fs.readdirSync(routeDir)
  .filter((name)=>name.endsWith('.routes.ts'))
  .map((name)=>`${routeDir}/${name}`);

test('post-split vertical routers expose at most one default export',()=>{
  for(const path of routeFiles){
    const source=read(path);
    const defaults=source.match(/export default router;/g)||[];
    assert.ok(defaults.length<=1,`${path} has duplicate default router exports`);
  }
});

test('guardian portal token hashing remains defined after bounded-context extraction',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian.routes.ts');
  assert.match(source,/import \{ createHash, randomBytes \} from 'node:crypto';/);
  assert.match(source,/const sha256 = \(value: string\) => createHash\('sha256'\)\.update\(value\)\.digest\('hex'\);/);
  assert.match(source,/const tokenSha256=sha256\(portalToken\);/);
});
