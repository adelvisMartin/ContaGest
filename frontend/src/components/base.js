import { escapeHtml } from '../utils/dom.js';

export const Icon = (name, className = 'w-5') => `<i class="fa-solid ${name} ${className}"></i>`;

const muiOptionsAttr = (options = []) => escapeHtml(JSON.stringify(options.map((option) => ({
  value: String(option.value ?? ''),
  label: String(option.label ?? option.value ?? '')
}))));


export const Button = ({ id = '', text = '', i18n = '', icon = '', variant = 'primary', attrs = '', className = '', type = 'submit' }) => {
  const muiVariant = variant === 'primary' || variant === 'accent' ? 'contained' : variant === 'danger' ? 'contained' : 'outlined';
  const muiColor = variant === 'danger' ? 'error' : 'primary';
  const safeAttrs = String(attrs || '');
  const hasTypeAttr = /\btype\s*=/.test(safeAttrs);
  const typeAttr = hasTypeAttr ? '' : `type="${escapeHtml(type)}"`;
  return `
  <span class="mui-button-host ${className}" data-mui-button-field data-mui-text="${escapeHtml(text)}" data-mui-icon="${escapeHtml(String(icon || '').replace('fa-solid ', ''))}" data-mui-variant="${muiVariant}" data-mui-color="${muiColor}">
    <button ${typeAttr} ${id ? `id="${id}"` : ''} class="btn btn-${variant} ${className}" ${safeAttrs} data-mui-button-fallback>${icon ? Icon(icon) : ''}<span ${i18n ? `data-i18n="${i18n}"` : ''}>${escapeHtml(text)}</span></button>
    <span class="mui-react-mount" data-mui-button-mount></span>
  </span>`;
};

export const KpiCard = ({ labelKey, valueId, subId = '', icon = 'fa-chart-simple', value = '-', sub = '', className = '' }) => `
  <article class="kpi ${className}">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="kpi-label" data-i18n="${labelKey}">${labelKey}</p>
        <h2 id="${valueId}" class="mt-2 truncate text-2xl font-black text-[#1e3a8a] dark:text-white">${escapeHtml(value)}</h2>
        ${subId ? `<p id="${subId}" class="mt-1 truncate text-sm font-bold text-slate-700 dark:text-slate-300">${escapeHtml(sub)}</p>` : ''}
      </div>
      <div class="rounded-2xl bg-[#1e3a8a]/10 px-3 py-2 text-[#1e3a8a] dark:bg-white/10 dark:text-white">${Icon(icon, '')}</div>
    </div>
  </article>
`;

export const StatCard = ({ label, value, icon = 'fa-chart-line', hint = '', tone = 'brand' }) => `
  <article class="panel-soft rounded-[1.3rem] p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-black uppercase tracking-[.14em] text-slate-600 dark:text-slate-300">${escapeHtml(label)}</p>
        <h3 class="mt-2 text-2xl font-black ${tone === 'accent' ? 'text-[#6366f1]' : 'text-[#1e3a8a] dark:text-white'}">${escapeHtml(value)}</h3>
        ${hint ? `<p class="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">${escapeHtml(hint)}</p>` : ''}
      </div>
      <span class="rounded-2xl bg-white px-3 py-2 text-[#1e3a8a] shadow-sm dark:bg-white/10 dark:text-white">${Icon(icon, '')}</span>
    </div>
  </article>
`;

export const Field = ({ labelKey, name, id = '', type = 'text', required = false, placeholderKey = '', value = '', attrs = '', className = '', inputClass = '' }) => `
  <div class="${className}">
    <label class="label" data-i18n="${labelKey}">${labelKey}</label>
    <input ${id ? `id="${id}"` : ''} name="${name}" type="${type}" ${required ? 'required' : ''} value="${escapeHtml(value)}" ${placeholderKey ? `data-i18n-placeholder="${placeholderKey}"` : ''} class="input ${inputClass}" ${attrs}/>
  </div>
`;

export const Textarea = ({ labelKey, name, placeholderKey = '', value = '', required = false, className = '' }) => `
  <div class="${className}">
    <label class="label" data-i18n="${labelKey}">${labelKey}</label>
    <textarea name="${name}" ${required ? 'required' : ''} ${placeholderKey ? `data-i18n-placeholder="${placeholderKey}"` : ''} class="textarea">${escapeHtml(value)}</textarea>
  </div>
`;

export const Select = ({ labelKey, name, options = [], value = '', className = '', attrs = '' }) => `
  <div class="mui-select-host ${className}" data-mui-select-field data-mui-name="${escapeHtml(name)}" data-mui-label="${escapeHtml(labelKey)}" data-mui-value="${escapeHtml(String(value))}" data-mui-options="${muiOptionsAttr(options)}">
    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" />
    <select name="${escapeHtml(name)}_fallback" class="select mui-fallback-select" data-mui-fallback ${attrs}>${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>
    <div class="mui-react-mount" data-mui-mount></div>
  </div>
`;

export const PageHeader = ({ eyebrowKey, titleKey, descKey, actions = '' }) => `
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <p class="text-sm font-black uppercase tracking-[.20em] text-[#6366f1]" data-i18n="${eyebrowKey}">${eyebrowKey}</p>
      <h2 class="mt-1 text-3xl font-black text-[#1e3a8a] dark:text-white" data-i18n="${titleKey}">${titleKey}</h2>
      <p class="mt-2 max-w-4xl text-sm font-bold text-slate-700 dark:text-slate-300" data-i18n="${descKey}">${descKey}</p>
    </div>
    <div class="flex flex-wrap gap-2">${actions}</div>
  </div>
`;

export const Table = ({ headers = [], rows = [], emptyKey = 'noData' }) => `
  <div class="table-wrap">
    <table class="table">
      <thead><tr>${headers.map((header) => `<th ${header.key ? `data-i18n="${header.key}"` : ''}>${escapeHtml(header.label || header.key || '')}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="text-center" data-i18n="${emptyKey}">Sin datos</td></tr>`}</tbody>
    </table>
  </div>
`;

export const Badge = (text, tone = 'slate') => {
  const styles = {
    slate: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
    success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    danger: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100',
    brand: 'bg-[#1e3a8a] text-white',
    accent: 'bg-[#6366f1] text-slate-950'
  };
  return `<span class="badge ${styles[tone] || styles.slate}">${escapeHtml(text)}</span>`;
};

export const EmptyState = ({ title = 'Sin datos', description = '', icon = 'fa-inbox' }) => `
  <div class="panel-soft rounded-[1.5rem] p-8 text-center">
    <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#1e3a8a] shadow-sm dark:bg-white/10 dark:text-white">${Icon(icon, '')}</div>
    <h3 class="text-xl font-black text-[#1e3a8a] dark:text-white">${escapeHtml(title)}</h3>
    ${description ? `<p class="mx-auto mt-2 max-w-xl text-sm font-bold text-slate-600 dark:text-slate-300">${escapeHtml(description)}</p>` : ''}
  </div>
`;
