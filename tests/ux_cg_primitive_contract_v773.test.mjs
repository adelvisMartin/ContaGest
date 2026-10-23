import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const components=readFileSync(new URL('../frontend/src/components/ui/cg/CgPrimitives.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../frontend/src/styles/contagest-visual-system-v12.css',import.meta.url),'utf8');
test('#773 CgSelect always has label and error/helper/disabled in canonical FormControl',()=>{
  const select=components.split('export function CgSelect(')[1].split('export function CgStatusChip(')[0];
  assert.match(select,/requires a persistent label/);
  assert.match(select,/aria-describedby=\{helperText \? helperId : undefined\}/);
  assert.match(select,/FormHelperText id=\{helperId\}/);
  assert.match(select,/disabled=\{disabled \|\| noOptions\}/);
  assert.match(select,/Sin opciones disponibles/);
});
test('#773 dialog actions avoid implicit form submits and permit pending state',()=>{
  const dialog=components.split('export function CgDialog(')[1].split('export function CgMoney(')[0];
  assert.match(dialog,/type="button" variant="text"/);
  assert.match(dialog,/type="button" disabled=\{confirmDisabled\}/);
  assert.match(dialog,/aria-labelledby=\{titleId\}/);
});
test('#773 shared table is keyboard reachable and named for assistive tech',()=>{
  const table=components.split('export function CgDataTable(')[1].split('function FontAwesomeIcon')[0];
  assert.match(table,/role="region" aria-label=\{label\} tabIndex=\{0\}/);
  assert.match(table,/<Table size="small" aria-label=\{label\}>/);
});
test('#773 shared CSS extends keyboard and forced-color focus to Cg/MUI select',()=>{
  assert.match(css,/\[role="combobox"\]/);
  assert.match(css,/\.MuiButtonBase-root\):focus-visible/);
  assert.match(css,/outline:2px solid Highlight!important/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});
