import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('message template vertical filter has a persistent associated label', () => {
  const page = fs.readFileSync('frontend/src/pages/CommunicationTemplatesPage.js', 'utf8');
  const label = page.match(/<label\s+for="messageVerticalFilter">([^<]+)<\/label>/);
  assert.ok(label, 'the message template filter must have a visible matching label');
  assert.ok(label[1].trim(), 'the label must have non-empty readable text');
  assert.match(page, /<select\s+id="messageVerticalFilter"\s+class="select">/);
});
