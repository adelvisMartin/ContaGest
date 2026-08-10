import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('customer license and subscription bypasses require explicit platform.manage permission',()=>{
  const context=read('backend/src/shared/middleware/context.ts');
  const commercial=read('backend/src/shared/commercial/subscriptionMiddleware.ts');
  const identity=read('backend/src/shared/identity/accountMembership.ts');
  for(const source of [context,commercial,identity]){
    assert.match(source,/platform\.manage/);
    assert.doesNotMatch(source,/role:\s*\{[^}]*system:true/s);
  }
  assert.match(context,/Only the explicit platform permission may bypass customer licensing/);
  assert.match(commercial,/permissions:\{some:\{permission:\{key:'platform\.manage'/);
  assert.match(identity,/hasPlatformPermission/);
});
