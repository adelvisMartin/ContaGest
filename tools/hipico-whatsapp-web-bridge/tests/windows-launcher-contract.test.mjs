import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const canonicalGroupPattern = "'^(?:\\d{5,}-\\d+|\\d{10,})@g\\.us$'";

async function readLauncher(name) {
  return fs.readFile(new URL(`../${name}`, import.meta.url), 'utf8');
}

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('production Windows launcher is single-copy and uses the canonical WhatsApp group id contract', async () => {
  const source = await readLauncher('INICIAR.ps1');

  assert.equal(occurrences(source, '$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path'), 1);
  assert.equal(occurrences(source, 'while ($true) {'), 1);
  assert.equal(occurrences(source, canonicalGroupPattern), 2, 'SOURCE and LAB must accept modern and legacy @g.us ids');

  assert.doesNotMatch(source, /\}\) \{ return \$null \}/);
  assert.doesNotMatch(source, /@g\\\.us\) \{ return/);
});

test('local LAB launcher accepts the same modern and legacy WhatsApp group ids', async () => {
  const source = await readLauncher('INICIAR-LAB-LOCAL.ps1');

  assert.equal(occurrences(source, canonicalGroupPattern), 2);
  assert.doesNotMatch(source, /'\^\\d\{5,\}-\\d\+@g\\\.us\$'/);
});
