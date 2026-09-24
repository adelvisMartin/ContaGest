import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('vertical Clean Code reuses shared request helpers in veterinary routes',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  assert.match(source,/import \{ ctx, one \} from '\.\/verticals\.shared\.js';/);
  assert.doesNotMatch(source,/const ctx\s*=\s*\(req:/);
  assert.doesNotMatch(source,/const one\s*=\s*<T>/);
  for(const route of ['/lab-orders','/hospitalizations','/guardian-portal/grants','/boarding/stays','/financial-cases']){
    assert.ok(source.includes(route),route);
  }
});

test('gym progression validation has one domain authority',()=>{
  const routes=read('backend/src/modules/verticals/gym.routes.ts');
  const domain=read('backend/src/modules/verticals/gym.progression.ts');
  assert.match(routes,/gymProgressionConfigIssues/);
  assert.match(routes,/isRirRpePairCoherent/);
  assert.match(domain,/export function gymProgressionConfigIssues/);
  assert.match(domain,/export const isRirRpePairCoherent/);
  assert.doesNotMatch(routes,/La progresión lineal requiere un incremento de carga/);
  assert.doesNotMatch(routes,/La doble progresión requiere un rango de repeticiones válido/);
  assert.doesNotMatch(routes,/La progresión por %1RM requiere 1RM y porcentaje/);
});

test('behavioral route contracts remain present after extraction',()=>{
  const gym=read('backend/src/modules/verticals/gym.routes.ts');
  for(const route of [
    '/gym/progression/evaluate',
    '/gym/routines',
    '/gym/workout-sessions',
    '/gym/performance',
    '/gym/exercise-substitutions/suggest',
    '/gym/nutrition',
    '/gym/adherence'
  ]) assert.ok(gym.includes(route),route);
});
