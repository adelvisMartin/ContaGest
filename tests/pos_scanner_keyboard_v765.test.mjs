import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decidePosScannerKey } from '../frontend/src/services/posScannerKeyboard.mjs';

const event=(key,extra={})=>({key,...extra});
test('slash focuses scanner from a neutral area of the Sales POS section',()=>{
  assert.equal(decidePosScannerKey(event('/')),'focus');
});
test('slash from input or editable field is ignored',()=>{
  for(const flag of [true])assert.equal(decidePosScannerKey(event('/',{targetIsEditable:flag})),'ignore');
});
test('operator typing slash in scanner itself does not hijack the input',()=>{
  assert.equal(decidePosScannerKey(event('/',{targetIsScanner:true,targetIsEditable:true})),'ignore');
});
test('modified keyboard shortcut never steals Ctrl+/ Alt+/ or Meta+/',()=>{
  for(const name of ['ctrlKey','altKey','metaKey']){
    assert.equal(decidePosScannerKey(event('/',{[name]:true})),'ignore');
  }
});
test('repeated slash cannot steal focus repeatedly while held',()=>{
  assert.equal(decidePosScannerKey(event('/',{repeat:true})),'ignore');
});
test('IME composition is not intercepted',()=>{
  assert.equal(decidePosScannerKey(event('/',{isComposing:true})),'ignore');
  assert.equal(decidePosScannerKey(event('Escape',{isComposing:true,targetIsScanner:true})),'ignore');
});
test('scan single flight and other busy states disable shortcuts',()=>{
  assert.equal(decidePosScannerKey(event('/',{busy:true})),'ignore');
  assert.equal(decidePosScannerKey(event('Escape',{targetIsScanner:true,busy:true})),'ignore');
});
test('open dialog blocks shortcut',()=>{
  assert.equal(decidePosScannerKey(event('/',{modalOpen:true})),'ignore');
});
test('Escape clears only when scanner is focus target',()=>{
  assert.equal(decidePosScannerKey(event('Escape',{targetIsScanner:true,targetIsEditable:true})),'clear');
});
test('Escape outside scanner is ignored and does not close forms',()=>{
  assert.equal(decidePosScannerKey(event('Escape')),'ignore');
  assert.equal(decidePosScannerKey(event('Escape',{targetIsEditable:true})),'ignore');
});
test('Enter is delegated to native scanner form, never synthetic submit',()=>{
  assert.equal(decidePosScannerKey(event('Enter',{targetIsScanner:true})),'ignore');
});
test('unrelated keys are ignored',()=>{
  for(const key of ['a','Tab','Backspace','ArrowDown','F4','1'])assert.equal(decidePosScannerKey(event(key)),'ignore');
});
test('malformed key event input is ignored fail-closed',()=>{
  for(const input of [null,undefined,[],true,24,'/',{}])assert.equal(decidePosScannerKey(input),'ignore');
});
const source=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
test('shortcut keyboard handling is scoped to Sales POS section, not window/document',()=>{
  assert.match(source,/aria-label="Carrito POS de borrador" onKeyDown=\{handlePosScannerKeyboard\}/);
  assert.doesNotMatch(source,/document\.addEventListener\(['"]keydown/);
  assert.doesNotMatch(source,/window\.addEventListener\(['"]keydown/);
});
test('real UI dispatches pure keyboard decision and prevents default only for recognized actions',()=>{
  const handler=source.slice(source.indexOf('function handlePosScannerKeyboard(event){'),source.indexOf('async function addPosFavoriteToCart'));
  assert.match(handler,/decidePosScannerKey\(\{/);
  assert.match(handler,/if\(action==='ignore'\)return;/);
  assert.match(handler,/event\.preventDefault\(\)/);
  assert.match(handler,/event\.stopPropagation\(\)/);
  assert.match(handler,/action==='focus'/);
  assert.match(handler,/else if\(action==='clear'\)setPosCode\(''\)/);
});
test('scanner uses actual CgTextField inputRef and refocuses only after successful form scan',()=>{
  assert.match(source,/inputRef=\{posScannerInputRef\}/);
  assert.match(source,/await lookupAndAddPosProduct\(posCode,null,true\)/);
  assert.match(source,/if\(refocusAfterSuccess && tenantAtStart===BackendApi\.tenantId/);
  assert.match(source,/posScannerRefocusPendingRef\.current=true/);
  assert.match(source,/if\(posLoading \|\| !posScannerRefocusPendingRef\.current\)return/);
  assert.match(source,/document\.activeElement===document\.body/);
  assert.match(source,/scanner\.focus\(\)/);
});
test('native form handles Enter and double-submit remains single-flight',()=>{
  assert.match(source,/component="form" onSubmit=\{addPosDraftProduct\}/);
  assert.match(source,/if\(posBusyRef\.current \|\| posVerifyBusyRef\.current\)return;/);
  assert.doesNotMatch(source,/requestSubmit\(|dispatchEvent\(new KeyboardEvent/);
});
test('explicit accessible focus action is provided for tablets',()=>{
  assert.match(source,/>\s*Enfocar lector/);
  assert.match(source,/aria-label="Carrito POS de borrador"/);
  assert.match(source,/Lector de códigos: Enter agrega un producto/);
});
