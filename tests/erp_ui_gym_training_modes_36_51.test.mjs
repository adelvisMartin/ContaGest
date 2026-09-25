import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fitnessWorkspaceSource, gymBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const backend=()=>gymBackendSource();
const page=()=>fitnessWorkspaceSource();
const modes=()=>fs.readFileSync('frontend/src/data/fitnessTrainingModes.js','utf8');
const migration=()=>fs.readFileSync('backend/prisma/migrations/20260923161500_gym_training_mode_36_51/migration.sql','utf8');

test('36/51 defines explicit selectable training modes while preserving a legacy display fallback',()=>{
  const source=modes();
  for(const token of ['strength','hypertrophy','pump','endurance','power','conditioning','mobility']) assert.ok(source.includes(token),token);
  assert.match(source,/Fuerza/);
  assert.match(source,/Hipertrofia/);
  assert.match(source,/Bombeo/);
  assert.match(source,/Resistencia/);
  assert.match(source,/Potencia/);
  assert.match(source,/Acondicionamiento/);
  assert.match(source,/Movilidad/);
  const catalog=source.slice(source.indexOf('FITNESS_TRAINING_MODES=Object.freeze(['),source.indexOf(']);')+3);
  assert.doesNotMatch(catalog,/unspecified/);
  assert.match(source,/value==='unspecified'\?'Sin clasificar \(legacy\)'/);
});

test('36/51 backend requires explicit mode for all newly created routines',()=>{
  const source=backend();
  assert.match(source,/trainingMode:\s*z\.enum\(\['strength','hypertrophy','pump','endurance','power','conditioning','mobility'\]\)/);
  assert.match(source,/"trainingMode"/);
  assert.match(source,/b\.trainingMode/);
});

test('36/51 migration preserves legacy truth instead of assigning a fabricated mode',()=>{
  const source=migration();
  assert.match(source,/ADD COLUMN IF NOT EXISTS "trainingMode"/);
  assert.match(source,/DEFAULT 'unspecified'/);
  assert.match(source,/unspecified/);
  for(const token of ['strength','hypertrophy','pump','endurance','power','conditioning','mobility']) assert.ok(source.includes(token),token);
});

test('36/51 UI requires and displays the selected training mode',()=>{
  const source=page();
  assert.match(source,/trainingMode:'hypertrophy'/);
  assert.match(source,/FITNESS_TRAINING_MODES/);
  assert.match(source,/label="Modo de entrenamiento"/);
  assert.match(source,/trainingMode:routineForm\.trainingMode/);
  assert.match(source,/fitnessTrainingModeLabel\(item\.trainingMode\)/);
});

test('36/51 mode definitions provide practical intent without silently rewriting exercise prescriptions',()=>{
  const source=modes();
  for(const token of ['description','focus','typicalReps','typicalRest']) assert.ok(source.includes(token),token);
  const ui=page();
  assert.doesNotMatch(ui,/applyMode.*sets|applyMode.*reps|applyMode.*loadKg/s);
});
