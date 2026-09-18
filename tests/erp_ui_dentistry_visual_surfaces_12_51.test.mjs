import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page=()=>fs.readFileSync('frontend/src/pages/DentistryPracticePage.jsx','utf8');
const selector=()=>fs.readFileSync('frontend/src/components/dentistry/ToothSurfaceSelector.jsx','utf8');

test('12/51 renders the five canonical odontogram surfaces as a visual tooth control',()=>{
  const source=selector();
  for(const value of ['vestibular','lingual_palatal','mesial','distal','occlusal_incisal']) assert.ok(source.includes(value),value);
  assert.match(source,/SURFACE_LAYOUT/);
  assert.match(source,/gridTemplateAreas/);
  assert.match(source,/aria-pressed/);
  assert.match(source,/minHeight:\s*44|minHeight:\s*'44px'/);
  assert.match(source,/minWidth:\s*44|minWidth:\s*'44px'/);
});

test('12/51 visual surface control remains a controlled component',()=>{
  const source=selector();
  for(const token of ['selectedSurfaces','onChange','disabled','toggleSurface']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML|document\./);
});

test('12/51 dentistry composes visual surfaces without changing odontogram persistence authority',()=>{
  const source=page();
  assert.match(source,/ToothSurfaceSelector/);
  assert.match(source,/selectedSurfaces=\{selectedSurfaces\}/);
  assert.match(source,/onChange=\{setSelectedSurfaces\}/);
  assert.match(source,/disabled=\{!selectedTooth\}/);
  assert.match(source,/surfaces:selectedSurfaces/);
  assert.match(source,/HealthVerticalService\.createEncounter\(/);
});

test('12/51 keeps surface selection reset on patient, dentition and tooth changes',()=>{
  const source=page();
  assert.ok((source.match(/setSelectedSurfaces\(\[\]\)/g)||[]).length>=3);
});
