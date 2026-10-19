import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync('frontend/src/services/verticalService.js', 'utf8');
const view = fs.readFileSync('frontend/src/pages/HealthcarePage.js', 'utf8');

test('Care uses canonical backend endpoints for patient timeline and reviewed facts', () => {
  assert.match(service, /patientTimeline\(patientId/);
  assert.match(service, /clinicalFacts\(patientId/);
  assert.match(service, /createClinicalFact\(payload/);
  assert.match(service, /reviewClinicalFact\(id/);
  assert.match(service, /amendClinicalFact\(id/);
});

test('clinical history presents safe empty, loading, error and amendment paths', () => {
  assert.match(view, /cg-clinical-timeline/);
  assert.match(view, /data\.clinicalFacts/);
  assert.match(view, /data\.patientTimeline/);
  assert.match(view, /data\.clinicalLoading/);
  assert.match(view, /data\.clinicalError/);
  assert.match(view, /careClinicalFactForm/);
  assert.match(view, /data-care-fact-review/);
  assert.match(view, /data-care-amend-form/);
  assert.match(view, /data-care-timeline-more/);
  assert.match(view, /data-care-facts-more/);
  assert.match(view, /fact\.isSuperseded/);
  assert.match(view, /fact\.hasAmendment/);
  assert.match(view, /Promise\.allSettled\(/);
  assert.match(view, /activate:false/);
  assert.match(view, /\.patientTimeline\(patientId,\s*cursor\)/);
  assert.match(view, /safe\(fact\./);
  assert.match(view, /Promise\.all\(/);
  assert.match(view, /clinicalFacts:\[\],clinicalFactsNextCursor:null,patientTimeline:\{items:\[\],nextCursor:null\},encounters:\[\]/);
});

test('review UI waits for remote confirmation instead of reporting optimistic success', () => {
  assert.match(view, /await HealthVerticalService\.reviewClinicalFact/);
  assert.match(view, /await HealthVerticalService\.amendClinicalFact/);
  assert.match(view, /submit\?\.setAttribute\('disabled'/);
});
