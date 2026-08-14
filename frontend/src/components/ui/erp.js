import { escapeHtml } from '../../utils/dom.js';

const cls = (...items) => items.flat().filter(Boolean).join(' ');
const text = (value) => escapeHtml(String(value ?? ''));

function attrs(input = {}) {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${text(value)}"`)
    .join('');
}

export const ErpUi = Object.freeze({
  stack(content = '', { className = '', gap } = {}) {
    return `<div class="${cls('cg-ui-stack', className)}"${gap ? ` style="gap:${text(gap)}"` : ''}>${content}</div>`;
  },

  row(content = '', { className = '', wrap = false } = {}) {
    return `<div class="${cls(wrap ? 'cg-ui-row-wrap' : 'cg-ui-row', className)}">${content}</div>`;
  },

  grid(content = '', { className = '' } = {}) {
    return `<div class="${cls('cg-ui-grid', className)}">${content}</div>`;
  },

  card(content = '', { className = '', body = true, ariaLabel } = {}) {
    const inner = body ? `<div class="cg-ui-card-body">${content}</div>` : content;
    return `<section class="${cls('cg-ui-card', className)}"${attrs(ariaLabel ? {'aria-label': ariaLabel} : {})}>${inner}</section>`;
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
    return `<label class="${cls('cg-ui-stack', className)}" for="${text(id)}"><span>${text(label)}</span><input class="cg-ui-control cg-u-w-full"${attrs({ id, name, type, value, placeholder, required, autocomplete, inputmode })}></label>`;
  },

  badge(label, { tone = 'neutral', className = '' } = {}) {
    return `<span class="${cls('cgx-badge', `cgx-badge-${tone}`, className)}">${text(label)}</span>`;
  },

  emptyState({ title = 'Sin datos', description = '', action = '' } = {}) {
    return `<div class="cgx-empty"><strong>${text(title)}</strong>${description ? `<p>${text(description)}</p>` : ''}${action}</div>`;
  },

  table({ columns = [], rows = [], caption = '', className = '' } = {}) {
    const head = columns.map((column) => `<th scope="col">${text(column.label ?? column.key)}</th>`).join('');
    const body = rows.map((row) => `<tr>${columns.map((column) => {
      const value = typeof column.render === 'function' ? column.render(row) : text(row?.[column.key]);
      return `<td${column.numeric ? ' class="cg-u-text-mono"' : ''}>${value ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<div class="cg-ui-table-wrap"><table class="${cls('cg-ui-table', className)}">${caption ? `<caption class="sr-only">${text(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
});

export const Stack = ErpUi.stack;
export const Row = ErpUi.row;
export const Grid = ErpUi.grid;
export const Card = ErpUi.card;
export const PageHeader = ErpUi.pageHeader;
export const Button = ErpUi.button;
export const Field = ErpUi.field;
export const Badge = ErpUi.badge;
export const EmptyState = ErpUi.emptyState;
export const DataTable = ErpUi.table;
