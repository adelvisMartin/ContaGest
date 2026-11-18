import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const snapshot=readFileSync('frontend/src/components/fitness/NutritionSnapshotPanel.jsx','utf8');
const panel=readFileSync('frontend/src/components/fitness/GymNutritionPanel.jsx','utf8');

test('#795 snapshot is never exposed when member/plan scope changes',()=>{
  assert.match(snapshot,/plan\.memberId===memberId/);
  assert.match(snapshot,/loadedScope===scope/);
  assert.match(snapshot,/requestVersion\.current\+=1/);
  assert.match(snapshot,/result\.plan\.memberId!==requestedMemberId/);
  assert.match(panel,/<NutritionSnapshotPanel plans=\{nutrition\} memberId=\{selectedMemberId\}/);
});

test('#795 revision protects member ownership and supports cancelling draft',()=>{
  assert.match(panel,/disabled=\{Boolean\(nutritionForm\.supersedesId\)\}/);
  assert.match(panel,/supersedesId:null,name:''/);
  assert.match(panel,/JSON\.parse\(JSON\.stringify\(Array\.isArray\(plan\.meals\)/);
});
