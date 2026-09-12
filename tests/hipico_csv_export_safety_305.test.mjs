import assert from 'node:assert/strict';
import test from 'node:test';
import { csvEscape } from '../frontend/public/hipico-control/assets/js/format.js';

test('#305 CSV export neutralizes spreadsheet formulas from untrusted text while preserving numeric values',()=>{
  assert.equal(csvEscape('Parx Racing'),'Parx Racing');
  assert.equal(csvEscape('Nombre, Apellido'),'"Nombre, Apellido"');
  assert.equal(csvEscape('=HYPERLINK("https://example.test","x")'),'"\'=HYPERLINK(""https://example.test"",""x"")"');
  assert.equal(csvEscape('+SUM(1,2)'),'"\'+SUM(1,2)"');
  assert.equal(csvEscape('-2+3'),"'-2+3");
  assert.equal(csvEscape('@SUM(A1:A2)'),"'@SUM(A1:A2)");
  assert.equal(csvEscape('\t=1+1'),"'\t=1+1");
  assert.equal(csvEscape('\r=1+1'),'"\'\r=1+1"');
  assert.equal(csvEscape('   =1+1'),"'   =1+1");
  assert.equal(csvEscape(-125.5),'-125.5');
  assert.equal(csvEscape(0),'0');
});
