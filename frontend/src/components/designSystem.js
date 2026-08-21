/*
 * Backward-compatible design-system facade.
 *
 * New code imports from `./ui/index.js`. This file keeps legacy imports alive
 * without maintaining a second component implementation or visual vocabulary.
 */
import {
  cx,
  money,
  icon,
  Button,
  PageHeader,
  MetricCard,
  DataTable,
  Field
} from './ui/kit.js';

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
    return `<form id="${String(id).replace(/["<>]/g,'')}" class="cgx-form-normalized ds-form" data-cgx-kit="form"><div class="cg-record-fields">${fields.map((field) => Field({
      labelKey:field.label || '',
      name:field.name || '',
      type:field.type || 'text',
      placeholder:field.placeholder || '',
      value:field.value || '',
      required:Boolean(field.required)
    })).join('')}</div>${Button({ label:submitLabel, iconName:'fa-floppy-disk', type:'submit' })}</form>`;
  },
  ResourcePage({ title='', subtitle='', actions='', kpis=[], columns=[], rows=[] } = {}) {
    return `<section class="cgx-page ds-resource-page" data-cgx-kit="resource-page">${DS.PageHeader({ title, subtitle, actions })}<section class="cgx-metric-grid">${kpis.map((item) => DS.Kpi(item)).join('')}</section>${DS.Table({ columns, rows })}</section>`;
  }
});
