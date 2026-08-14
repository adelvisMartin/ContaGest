import { escapeHtml } from '../../utils/dom.js';

const cls = (...items) => items.flat().filter(Boolean).join(' ');
const text = (value) => escapeHtml(String(value ?? ''));
const safeTag = (tag = 'section') => ['section', 'article', 'div', 'aside'].includes(tag) ? tag : 'section';
const gapClass = (gap = 'md') => ({ xs:'cg-ui-gap-xs', sm:'cg-ui-gap-sm', md:'cg-ui-gap-md', lg:'cg-ui-gap-lg', xl:'cg-ui-gap-xl' }[gap] || 'cg-ui-gap-md');

function attrs(input = {}) {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${text(value)}"`)
    .join('');
}

export const ErpUi = Object.freeze({
  stack(content = '', { className = '', gap = 'md' } = {}) {
    return `<div class="${cls('cg-ui-stack', gapClass(gap), className)}">${content}</div>`;
  },
  row(content = '', { className = '', wrap = false } = {}) {
    return `<div class="${cls(wrap ? 'cg-ui-row-wrap' : 'cg-ui-row', className)}">${content}</div>`;
  },
  grid(content = '', { className = '', columns = 'auto' } = {}) {
    const columnsClass = ['one', 'two', 'three', 'four'].includes(columns) ? `cg-ui-grid-${columns}` : '';
    return `<div class="${cls('cg-ui-grid', columnsClass, className)}">${content}</div>`;
  },
  card(content = '', { className = '', body = true, ariaLabel, tag = 'section' } = {}) {
    const element = safeTag(tag);
    const inner = body ? `<div class="cg-ui-card-body">${content}</div>` : content;
    return `<${element} class="${cls('cg-ui-card', className)}"${attrs(ariaLabel ? {'aria-label': ariaLabel} : {})}>${inner}</${element}>`;
  },
  section({ title = '', description = '', actions = '', content = '', className = '', tag = 'section' } = {}) {
    const element = safeTag(tag);
    return `<${element} class="${cls('cg-ui-card', 'cg-ui-section', className)}"><header class="cg-ui-section-head"><div class="cg-u-min-0"><h2 class="cg-ui-section-title">${text(title)}</h2>${description ? `<p class="cg-ui-muted">${text(description)}</p>` : ''}</div>${actions ? `<div class="cg-ui-row-wrap">${actions}</div>` : ''}</header><div class="cg-ui-section-body">${content}</div></${element}>`;
  },
  pageHeader({ eyebrow = '', title = '', description = '', actions = '', className = '' } = {}) {
    return `<header class="${cls('cg-ui-page-header', className)}"><div class="cg-u-min-0">${eyebrow ? `<p class="cgx-eyebrow">${text(eyebrow)}</p>` : ''}<h1 class="cg-ui-page-title">${text(title)}</h1>${description ? `<p class="cg-ui-muted">${text(description)}</p>` : ''}</div>${actions ? `<div class="cg-ui-row-wrap">${actions}</div>` : ''}</header>`;
  },
  button(label, { variant = 'secondary', className = '', icon = '', type = 'button', disabled = false, ariaLabel, data = {} } = {}) {
    const dataAttrs = Object.fromEntries(Object.entries(data).map(([key, value]) => [`data-${key}`, value]));
    return `<button class="${cls('cg-ui-button', `cg-ui-button-${variant}`, className)}"${attrs({ type, disabled, ...(ariaLabel ? {'aria-label': ariaLabel} : {}), ...dataAttrs })}>${icon ? `<i class="${text(icon)}" aria-hidden="true"></i>` : ''}<span>${text(label)}</span></button>`;
  },
  field({ label, name, value = '', type = 'text', placeholder = '', required = false, autocomplete, inputmode, className = '' } = {}) {
    const id = `cg-${String(name || label || 'field').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
    return `<label class="${cls('cg-ui-stack', 'cg-ui-gap-xs', className)}" for="${text(id)}"><span class="cg-ui-field-label">${text(label)}</span><input class="cg-ui-control cg-u-w-full"${attrs({ id, name, type, value, placeholder, required, autocomplete, inputmode })}></label>`;
  },
  badge(label, { tone = 'neutral', className = '' } = {}) {
    return `<span class="${cls('cgx-badge', `cgx-badge-${tone}`, className)}">${text(label)}</span>`;
  },
  emptyState({ title = 'Sin datos', description = '', action = '' } = {}) {
    return `<div class="cgx-empty"><strong>${text(title)}</strong>${description ? `<p>${text(description)}</p>` : ''}${action}</div>`;
  },
  table({ columns = [], rows = [], caption = '', className = '' } = {}) {
    const head = columns.map((column) => `<th scope="col"${column.numeric ? ' class="cg-u-text-right"' : ''}>${text(column.label ?? column.key)}</th>`).join('');
    const body = rows.map((row) => `<tr>${columns.map((column) => {
      const value = typeof column.render === 'function' ? column.render(row) : text(row?.[column.key]);
      return `<td${column.numeric ? ' class="cg-u-text-mono cg-u-text-right"' : ''}>${value ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="cg-ui-table-wrap"><table class="${cls('cg-ui-table', className)}">${caption ? `<caption class="sr-only">${text(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
});

// Deliberately namespaced exports: kit.js already owns the stable public names
// used by production pages. New primitives can be adopted incrementally without
// shadowing PageHeader/Button/Field/DataTable and breaking the current ERP.
export const ErpStack = ErpUi.stack;
export const ErpRow = ErpUi.row;
export const ErpGrid = ErpUi.grid;
export const ErpCard = ErpUi.card;
export const ErpSection = ErpUi.section;
export const ErpPageHeader = ErpUi.pageHeader;
export const ErpButton = ErpUi.button;
export const ErpField = ErpUi.field;
export const ErpBadge = ErpUi.badge;
export const ErpEmptyState = ErpUi.emptyState;
export const ErpDataTable = ErpUi.table;
