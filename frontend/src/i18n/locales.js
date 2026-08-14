export const LANGUAGES = Object.freeze({
  es: Object.freeze({ code:'es', label:'Español', short:'ES', locale:'es-VE', dir:'ltr' }),
  en: Object.freeze({ code:'en', label:'English', short:'EN', locale:'en-US', dir:'ltr' }),
  pt: Object.freeze({ code:'pt', label:'Português', short:'PT', locale:'pt-BR', dir:'ltr' }),
  zh: Object.freeze({ code:'zh', label:'中文', short:'中文', locale:'zh-CN', dir:'ltr' }),
  hi: Object.freeze({ code:'hi', label:'हिन्दी', short:'हिं', locale:'hi-IN', dir:'ltr' }),
  ar: Object.freeze({ code:'ar', label:'العربية', short:'عر', locale:'ar', dir:'rtl' })
});

export const DEFAULT_LANGUAGE = 'es';
export const LANGUAGE_OPTIONS = Object.freeze(Object.values(LANGUAGES).map(({ code, label }) => ({ value:code, label })));
export const LANGUAGE_COMPACT_OPTIONS = Object.freeze(Object.values(LANGUAGES).map(({ code, short }) => ({ value:code, label:short })));

let currentLanguage = DEFAULT_LANGUAGE;

export function normalizeLanguage(value) {
  const raw = String(value || '').trim().toLowerCase().replace('_','-');
  if (LANGUAGES[raw]) return raw;
  const base = raw.split('-')[0];
  return LANGUAGES[base] ? base : DEFAULT_LANGUAGE;
}

export function setI18nLanguage(value) {
  currentLanguage = normalizeLanguage(value);
  return currentLanguage;
}

export function getI18nLanguage() {
  return currentLanguage;
}

export function getLanguageMeta(value = currentLanguage) {
  return LANGUAGES[normalizeLanguage(value)];
}

export function getIntlLocale(value = currentLanguage) {
  return getLanguageMeta(value).locale;
}

export function getDirection(value = currentLanguage) {
  return getLanguageMeta(value).dir;
}
