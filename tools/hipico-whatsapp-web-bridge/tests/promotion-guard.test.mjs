import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertLocalPromotionSafe, localKillSwitchState } from '../src/promotion-guard.mjs';

test('kill switch is inactive by default',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-kill-'));
  assert.equal(localKillSwitchState({},dir).active,false);
});

test('presence of local file blocks assisted/production before any network call',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-kill-'));
  fs.writeFileSync(path.join(dir,'.hipico-kill-switch'),'incident\n');
  assert.throws(()=>assertLocalPromotionSafe({HIPICO_OPERATION_MODE:'production'},dir),/HIPICO_LOCAL_KILL_SWITCH_ACTIVE/);
  assert.throws(()=>assertLocalPromotionSafe({HIPICO_OPERATION_MODE:'assisted'},dir),/HIPICO_LOCAL_KILL_SWITCH_ACTIVE/);
  assert.equal(assertLocalPromotionSafe({HIPICO_OPERATION_MODE:'shadow'},dir).requestedMode,'shadow');
});
