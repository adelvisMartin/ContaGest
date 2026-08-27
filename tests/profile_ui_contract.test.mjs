import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const profile = read('frontend/src/pages/ProfilePage.js');
const visual = read('frontend/src/styles/contagest-visual-system-v12.css');

test('profile route composes the canonical visual primitives instead of raw stacked controls', () => {
  for (const selector of ['cgx-metric-grid', 'cgx-section', 'cgx-section-head', 'cgx-section-body', 'cg-record-fields', 'cgx-module-standard']) {
    assert.ok(profile.includes(selector), `profile must use ${selector}`);
  }
  assert.doesNotMatch(profile, /class="cg-profile-form"/);
  assert.doesNotMatch(profile, /coordinate-security-icon/);
  assert.doesNotMatch(profile, /coordinate-security-info/);
  assert.doesNotMatch(profile, /style\s*=/i);
});

test('profile keeps field and icon-label spacing owned by the canonical visual system', () => {
  assert.match(visual, /body \.cgx-field \{[^}]*gap:5px/s);
  assert.match(visual, /body \.cgx-btn[^\{]*\{[^}]*gap:7px/s);
  assert.match(visual, /body \.cg-record-fields \{[^}]*gap:11px/s);
  assert.match(visual, /@media \(max-width:430px\)[\s\S]*cg-record-fields[^\{]*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(visual, /@media \(max-width:430px\)[\s\S]*cg-form-actions>\.cgx-btn[^\{]*\{[^}]*width:100%/);
});

test('profile security panel remains accessible and wired to the existing workflows', () => {
  assert.match(profile, /aria-labelledby="profileInformationTitle"/);
  assert.match(profile, /aria-labelledby="coordinateSecurityTitle"/);
  assert.match(profile, /aria-busy=/);
  assert.match(profile, /aria-live="polite"/);
  assert.match(profile, /mountSubmit\('#profileForm'/);
  assert.match(profile, /AuthService\.coordinateStatus\(\)/);
  assert.match(profile, /AuthService\.enrollCoordinateCard\(\)/);
  assert.match(profile, /AuthService\.revokeCoordinateCard\(\)/);
});
