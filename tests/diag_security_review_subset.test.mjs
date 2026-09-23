import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../frontend/public/hipico-control/assets/js/ui.js';

test('escape',()=>{
  for(const payload of ['<img src=x onerror=alert(1)>','<svg/onload=alert(1)>','"><script>alert(1)</script>',"' onfocus='alert(1)",'<a href="javascript:alert(1)">x</a>']){
    const escaped=escapeHtml(payload);
    assert.doesNotMatch(escaped,/<script|<img|<svg|<a\s/i);
    assert.notEqual(escaped,payload);
    if(payload.includes('<'))assert.match(escaped,/&lt;/);
    if(payload.includes('>'))assert.match(escaped,/&gt;/);
    if(payload.includes('"'))assert.match(escaped,/&quot;/);
    if(payload.includes("'"))assert.match(escaped,/&#39;/);
  }
});
