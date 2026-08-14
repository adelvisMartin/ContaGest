import { customerCopyReplacements, routeTranslations, translations } from './translations.js';
import { legacySpanish, routeFallbackTranslations, sharedTranslations } from './fallbacks.js';
import { DEFAULT_LANGUAGE, LANGUAGE_COMPACT_OPTIONS, LANGUAGE_OPTIONS, getDirection, getLanguageMeta, normalizeLanguage, setI18nLanguage } from './locales.js';

const spanishCatalog = { ...legacySpanish, ...sharedTranslations.es, ...translations.es };
const reverseSpanish = new Map(Object.entries(spanishCatalog).map(([key, value]) => [String(value).trim(), key]));
let observer = null;
let activeLanguage = DEFAULT_LANGUAGE;
let translating = false;

const uiTextParent = (node) => node?.parentElement?.closest('button,label,summary,nav,h1,h2,h3,h4,h5,h6,p,span,small,th,option,legend,[role="button"],[role="tab"],[role="menuitem"]');
const skipTextNode = (node) => !node?.parentElement || node.parentElement.closest('script,style,code,pre,kbd,samp,textarea,[contenteditable="true"],[data-i18n-skip]');

export function t(key, lang = activeLanguage) {
  const normalized = normalizeLanguage(lang);
  return translations[normalized]?.[key]
    ?? sharedTranslations[normalized]?.[key]
    ?? translations.es[key]
    ?? sharedTranslations.es[key]
    ?? legacySpanish[key]
    ?? key;
}

export function routeT(route, lang = activeLanguage) {
  const normalized = normalizeLanguage(lang);
  return routeTranslations[normalized]?.[route]
    ?? routeFallbackTranslations[normalized]?.[route]
    ?? routeTranslations.es?.[route]
    ?? routeFallbackTranslations.es?.[route]
    ?? route;
}

function translateLiteral(value, lang) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return value;
  const normalizedSource = customerCopyReplacements[trimmed] || trimmed;
  const key = reverseSpanish.get(normalizedSource);
  return key ? t(key, lang) : normalizedSource;
}

function replaceTextNode(node, lang) {
  if (skipTextNode(node) || !uiTextParent(node)) return;
  const source = String(node.nodeValue || '');
  const trimmed = source.trim();
  if (!trimmed) return;
  const translated = translateLiteral(trimmed, lang);
  if (!translated || translated === trimmed) return;
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  node.nodeValue = `${leading}${translated}${trailing}`;
}

function translateElement(element, lang) {
  if (!(element instanceof Element)) return;
  if (element.matches('[data-i18n]')) element.textContent = t(element.dataset.i18n, lang);
  if (element.matches('[data-i18n-placeholder]')) element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder, lang));
  if (element.matches('[data-i18n-title]')) element.setAttribute('title', t(element.dataset.i18nTitle, lang));
  if (element.matches('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel, lang));
  if (element.matches('[data-i18n-route]')) element.textContent = routeT(element.dataset.i18nRoute, lang);
  element.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n, lang); });
  element.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, lang)); });
  element.querySelectorAll('[data-i18n-title]').forEach((node) => { node.setAttribute('title', t(node.dataset.i18nTitle, lang)); });
  element.querySelectorAll('[data-i18n-aria-label]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, lang)); });
  element.querySelectorAll('[data-i18n-route]').forEach((node) => { node.textContent = routeT(node.dataset.i18nRoute, lang); });
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) replaceTextNode(node, lang);
}

function translateTree(root, lang) {
  if (!root || typeof document === 'undefined') return;
  if (root.nodeType === Node.TEXT_NODE) { replaceTextNode(root, lang); return; }
  if (root.nodeType === Node.DOCUMENT_NODE) { translateElement(document.body, lang); return; }
  translateElement(root, lang);
}

function fillLanguageSelect(select, lang, compact = false) {
  if (!(select instanceof HTMLSelectElement)) return;
  const options = compact ? LANGUAGE_COMPACT_OPTIONS : LANGUAGE_OPTIONS;
  const current = normalizeLanguage(select.value || lang);
  const signature = options.map((option) => option.value).join(',');
  if (select.dataset.i18nLanguages === signature) { select.value = current; return; }
  const fragment = document.createDocumentFragment();
  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === current;
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
  select.dataset.i18nLanguages = signature;
  select.value = current;
}

function hydrateLanguageControls(lang) {
  if (typeof document === 'undefined') return;
  const compactIds = new Set(['langSelector']);
  document.querySelectorAll('#langSelector,#userMenuLang,select[name="lang"]').forEach((select) => fillLanguageSelect(select, lang, compactIds.has(select.id)));
  document.querySelectorAll('[data-mui-name="lang"]').forEach((host) => {
    host.dataset.muiOptions = JSON.stringify(LANGUAGE_COMPACT_OPTIONS.map((item) => ({ value:item.value, label:item.label })));
    host.dataset.muiValue = normalizeLanguage(lang);
    const hidden = host.querySelector('input[type="hidden"][name="lang"]');
    if (hidden) hidden.value = normalizeLanguage(lang);
  });
}

function installObserver() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    if (translating) return;
    translating = true;
    try {
      for (const mutation of mutations) mutation.addedNodes.forEach((node) => translateTree(node, activeLanguage));
      hydrateLanguageControls(activeLanguage);
    } finally { translating = false; }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
}

export function applyTranslations(lang = DEFAULT_LANGUAGE, root = document) {
  activeLanguage = setI18nLanguage(lang);
  if (typeof document === 'undefined') return activeLanguage;
  const meta = getLanguageMeta(activeLanguage);
  document.documentElement.lang = meta.locale;
  document.documentElement.dir = getDirection(activeLanguage);
  document.documentElement.dataset.lang = activeLanguage;
  document.body?.setAttribute('dir', meta.dir);
  translating = true;
  try {
    hydrateLanguageControls(activeLanguage);
    translateTree(root === document ? document.body : root, activeLanguage);
  } finally { translating = false; }
  installObserver();
  return activeLanguage;
}

export function useTranslate(lang = activeLanguage) {
  const normalized = normalizeLanguage(lang);
  return { lang:normalized, meta:getLanguageMeta(normalized), t:(key)=>t(key,normalized), routeT:(route)=>routeT(route,normalized), languages:LANGUAGE_OPTIONS };
}

export { LANGUAGE_OPTIONS, LANGUAGE_COMPACT_OPTIONS, normalizeLanguage } from './locales.js';
