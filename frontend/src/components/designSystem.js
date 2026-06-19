import { escapeHtml } from '../utils/dom.js';

export const cx = (...classes) => classes.filter(Boolean).join(' ');
export const money = (value, currency = 'Bs.') => `${currency} ${Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const icon = (name, cls = '') => `<span class="material-symbols-outlined ${escapeHtml(cls)}">${escapeHtml(name)}</span>`;

export const DS = {
  Button({ id='', label='', iconName='', variant='primary', attrs='', className='' }) {
    return `<button ${id?`id="${escapeHtml(id)}"`:''} class="ds-btn ds-btn-${variant} ${escapeHtml(className)}" ${attrs}>${iconName?icon(iconName):''}<span>${escapeHtml(label)}</span></button>`;
  },
  PageHeader({ title, subtitle='', actions='' }) {
    return `<header class="ds-page-header"><div><h2>${escapeHtml(title)}</h2>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:''}</div><div class="ds-actions">${actions}</div></header>`;
  },
  Kpi({ label, value, sub='', tone='neutral', iconName='' }) {
    return `<article class="ds-kpi ds-kpi-${tone}"><div class="ds-kpi-top"><span>${escapeHtml(label)}</span>${iconName?icon(iconName):''}</div><strong>${escapeHtml(String(value))}</strong>${sub?`<p>${escapeHtml(sub)}</p>`:''}</article>`;
  },
  Table({ columns, rows, empty='Sin datos' }) {
    return `<div class="ds-table-wrap"><table class="ds-table"><thead><tr>${columns.map(c=>`<th>${escapeHtml(c.label||c.key)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${columns.map(c=>`<td class="${c.align==='right'?'ds-num':''}">${c.render?c.render(row):escapeHtml(String(row[c.key]??''))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}" class="text-center">${escapeHtml(empty)}</td></tr>`}</tbody></table></div>`;
  },
  Form({ id, fields, submitLabel='Guardar' }) {
    return `<form id="${escapeHtml(id)}" class="ds-form">${fields.map(f=>`<label><span>${escapeHtml(f.label)}</span><input name="${escapeHtml(f.name)}" type="${escapeHtml(f.type||'text')}" placeholder="${escapeHtml(f.placeholder||'')}" value="${escapeHtml(f.value||'')}" ${f.required?'required':''}></label>`).join('')}<button class="ds-btn ds-btn-primary" type="submit">${escapeHtml(submitLabel)}</button></form>`;
  },
  ResourcePage({ title, subtitle, actions='', kpis=[], columns=[], rows=[] }) {
    return `<section class="ds-resource-page">${DS.PageHeader({title, subtitle, actions})}<div class="ds-kpi-grid">${kpis.map(k=>DS.Kpi(k)).join('')}</div>${DS.Table({columns, rows})}</section>`;
  }
};
