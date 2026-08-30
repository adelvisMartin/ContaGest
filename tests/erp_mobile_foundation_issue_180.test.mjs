import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync('frontend/src/components/ui/cg/CgMobilePrimitives.jsx','utf8');

test('foundation declares canonical 360/390/430/tablet/desktop breakpoints',()=>{
  for(const token of ['phoneMin:360','phonePrimary:390','phoneWide:430','tablet:768','desktop:1440'])assert.match(source,new RegExp(token.replace(':','\\s*:\\s*')));
});

test('touch target contract is 44px and action/nav use it',()=>{
  assert.match(source,/CG_TOUCH_TARGET_PX=44/);
  assert.match(source,/minHeight:CG_TOUCH_TARGET_PX/);
});

test('shared primitives include safe table form grid metric grid nav and action bar',()=>{
  for(const name of ['CgResponsivePage','CgResponsiveGrid','CgMetricGrid','CgMobileNav','CgActionBar','CgFormGrid','CgSafeTable','CgNoBodyOverflowBoundary'])assert.match(source,new RegExp(`export function ${name}`));
});

test('mobile text inputs request 16px to avoid iOS zoom and horizontal containers own their overflow',()=>{
  assert.match(source,/fontSize:\{xs:16/);
  assert.match(source,/overflowX:'auto'/);
  assert.match(source,/overflowX:'clip'/);
});
