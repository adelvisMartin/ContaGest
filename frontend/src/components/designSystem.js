/*
 * Backward-compatible design-system facade.
 *
 * New code imports from `./ui/index.js`. This file keeps legacy imports alive
 * without maintaining a second component implementation or visual vocabulary.
 */
import { escapeHtml } from '../utils/dom.js';
import {
  cx,
  money,
  icon,
  Button,
  PageHeader,
  MetricCard,
  DataTable
} from './ui/kit.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export { cx, money, icon };

export const DS = Object.freeze({
  Button({ id='', label='', iconName='', variant='primary', attrs='', className='' } = {}) {
    return Button({ id, label, iconName, variant, attrs, className, type:'button' });
  },
  PageHeader({ title='', subtitle='', actions='' } = {}) {
    return PageHeader({ eyebrow:'ContaGest ERP', title, description:subtitle, actions });
  },
  Kpi({ label='', value='-', sub='', tone='neutral', iconName='' } = {}) {
    return MetricCard({ label, value, hint:sub, tone, iconName:iconName || 'fa-chart-simple' });
  },
  Table({ columns=[], rows=[], empty='Sin datos' } = {}) {
    return DataTable({ columns, rows, empty });
  },
  Form({ id='', fields=[], submitLabel='Guardar' } = {}) {
    const controls = fields.map((field) => `<div class="cgx-field" data-cgx-kit="field"><label class="cgx-label" for="${safe(`${id}-${field.name || 'field'}`)}">${safe(field.label || '')}</label><input id="${safe(`${id}-${field.name || 'field'}`)}" class="cgx-field-normalized input" name="${safe(field.name || '')}" type="${safe(field.type || 'text')}" placeholder="${safe(field.placeholder || '')}" value="${safe(field.value || '')}" ${field.required ? 'required' : ''}></div>`).join('');
    return `<form id="${safe(id)}" class="cgx-form-normalized ds-form" data-cgx-kit="form"><div class="cg-record-fields">${controls}</div><div class="cg-form-actions">${Button({ label:submitLabel, iconName:'fa-floppy-disk', type:'submit' })}</div></form>`;
  },
  ResourcePage({ title='', subtitle='', actions='', kpis=[], columns=[], rows=[] } = {}) {
    return `<section class="cgx-page ds-resource-page" data-cgx-kit="resource-page">${DS.PageHeader({ title, subtitle, actions })}<section class="cgx-metric-grid">${kpis.map((item) => DS.Kpi(item)).join('')}</section>${DS.Table({ columns, rows })}</section>`;
  }
});
