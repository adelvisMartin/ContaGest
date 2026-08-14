import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, LANGUAGE_OPTIONS, getDirection, normalizeLanguage } from '../frontend/src/i18n/locales.js';
import { routeT, t, useTranslate } from '../frontend/src/i18n/useTranslate.js';
import { BUSINESS_MODES, MODULE_TIERS, modulesForMode } from '../frontend/src/data/moduleCatalog.js';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';

test('global i18n exposes six supported languages including Portuguese', () => {
  assert.deepEqual(Object.keys(LANGUAGES), ['es','en','pt','zh','hi','ar']);
  assert.equal(LANGUAGE_OPTIONS.length, 6);
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('ar-SA'), 'ar');
  assert.equal(getDirection('ar'), 'rtl');
  assert.equal(getDirection('pt'), 'ltr');
});

test('translation helper resolves common copy and routes in every language', () => {
  for (const lang of ['es','en','pt','zh','hi','ar']) {
    const translate = useTranslate(lang);
    assert.notEqual(translate.t('dashboard'), 'dashboard');
    assert.notEqual(translate.t('settingsTitle'), 'settingsTitle');
    assert.notEqual(translate.routeT('veterinaria'), 'veterinaria');
    assert.notEqual(routeT('salud', lang), 'salud');
  }
  assert.equal(t('save','en'), 'Save');
  assert.equal(t('save','pt'), 'Salvar');
  assert.equal(t('save','zh'), '保存');
  assert.equal(t('save','hi'), 'सहेजें');
  assert.equal(t('save','ar'), 'حفظ');
});

test('commercial tiers no longer expose test/demo wording to client UI', () => {
  assert.equal(MODULE_TIERS.core.label, 'Operativo');
  assert.equal(MODULE_TIERS.advanced.label, 'Especializado');
  assert.equal(MODULE_TIERS.demo.label, 'Opcional');
  assert.match(BUSINESS_MODES.demo.label, /Comercial/);
  assert.doesNotMatch(Object.values(MODULE_TIERS).map((item)=>`${item.label} ${item.description}`).join(' '), /\bdemo\b|\bprueba\b|preventa|prototipo/i);
});

test('vertical business modes expose their domain modules', () => {
  assert.ok(modulesForMode('salud').some((module)=>module.route==='salud'));
  assert.ok(modulesForMode('veterinaria').some((module)=>module.route==='veterinaria'));
  assert.ok(modulesForMode('psicologia').some((module)=>module.route==='psicologia'));
  assert.ok(modulesForMode('gimnasio').some((module)=>module.route==='gimnasio'));
});

test('vertical RBAC roles exist and preserve route isolation', () => {
  const state = { rbac:AccessControlService.defaultState() };
  const roleIds = new Set(state.rbac.roles.map((role)=>role.id));
  for (const roleId of ['role-clinica','role-veterinaria','role-psicologia','role-gimnasio','role-vendedor']) assert.ok(roleIds.has(roleId));
  state.rbac.activeUserId='qa-clinic';
  state.rbac.users.push({ id:'qa-clinic', fullName:'Clínica QA', email:'clinic@qa.local', roleId:'role-clinica', status:'active', demo:false });
  assert.equal(AccessControlService.canAccessRoute(state,'salud'), true);
  assert.equal(AccessControlService.canAccessRoute(state,'veterinaria'), false);
  assert.equal(AccessControlService.canAccessRoute(state,'psicologia'), false);
  assert.equal(AccessControlService.canAccessRoute(state,'nomina'), false);
  assert.equal(AccessControlService.canAccessRoute(state,'admin'), false);
});
