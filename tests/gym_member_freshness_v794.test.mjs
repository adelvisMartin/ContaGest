import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('frontend/src/pages/GymManagementPage.jsx','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));

test('#794 stale bootstrap state cannot be treated as current server verification',()=>{
  assert.match(source,/const \[serverVerified,setServerVerified\]=useState\(false\)/);
  assert.match(source,/const \[loading,setLoading\]=useState\(true\)/);
});
test('#794 first render blocks member and nutrition details until verified',()=>{
  const gate=source.indexOf('if (!serverVerified) return <Stack');
  const privateSummary=source.indexOf('<Metric label="Clientes activos"');
  assert.ok(gate>0 && privateSummary>gate);
  assert.match(source,/No mostramos perfiles, evaluaciones ni rutinas almacenadas/);
});
test('#794 each refresh revokes old validation before requesting new tenant data',()=>{
  const scope=slice('async function loadAll(', 'const selectTab=');
  assert.match(scope,/setServerVerified\(false\);setLoading\(true\)/);
  assert.match(scope,/await loadMemberData\(nextMemberId\)/);
  assert.match(scope,/finally\{setLoading\(false\);\}/);
  assert.doesNotMatch(scope,/catch\(cause\)[\s\S]*?setServerVerified\(true\)/);
});
test('#794 member switch invalidates prior assessment, routine and nutrition permissions',()=>{
  const scope=slice('async function loadMemberData(', 'async function loadAll(');
  assert.match(scope,/setServerVerified\(false\)/);
  assert.match(scope,/GymVerticalService\.assessments\(memberId\)/);
  assert.match(scope,/GymVerticalService\.routines\(memberId\)/);
  assert.match(scope,/GymVerticalService\.nutrition\(memberId\)/);
  assert.ok(scope.lastIndexOf('setServerVerified(true)') > scope.indexOf('setRoutines(rows(routineResponse))'));
});
test('#794 failure state exposes retry and no stale member placeholders',()=>{
  assert.match(source,/if \(!serverVerified\) return/);
  assert.match(source,/No se pudo verificar el acceso/);
  assert.match(source,/Reintentar verificación/);
});
test('#794 no local offline write queue or exposed bearer tokens were introduced',()=>{
  assert.doesNotMatch(source,/enqueueOfflineOperation|navigator\.serviceWorker\.sync|localStorage\.setItem/);
  assert.doesNotMatch(source,/Bearer |service_role|Authorization:/);
});
