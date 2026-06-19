import { escapeHtml } from '../utils/dom.js';
import { Badge, Button, DataTable, Field, MaterialIcon, MetricCard, MetricGrid, PageHeader, Section } from './ui/index.js';

export const MI = (name, cls = '') => MaterialIcon(name, cls);

export const Pro = {
  chip(label, tone = 'neutral', icon = '') {
    return Badge({ label: `${icon ? '' : ''}${String(label)}`, tone });
  },
  button({ id = '', label = '', icon = '', tone = 'primary', attrs = '', className = '' } = {}) {
    const variant = tone === 'soft' || tone === 'neutral' ? 'secondary' : tone;
    return Button({ id, label, iconName: icon, variant, attrs, className, type: 'button' });
  },
  header({ eyebrow = '', title = '', subtitle = '', actions = '' } = {}) {
    return PageHeader({ eyebrow, title, description: subtitle, actions });
  },
  kpi({ label = '', value = '', sub = '', icon = 'analytics', tone = 'neutral' } = {}) {
    return MetricCard({ label, value, hint: sub, iconName: icon, tone });
  },
  kpiGrid(items = []) {
    return MetricGrid(items.map((item) => ({ label: item.label, value: item.value, hint: item.sub, iconName: item.icon, tone: item.tone || 'brand' })));
  },
  toolbar({ searchId = 'plSearch', placeholder = 'Buscar...', actions = '', tabs = '' } = {}) {
    return `<section class="cgx-toolbar pl-toolbar" data-cgx-kit="toolbar"><label class="pl-search"><i class="fa-solid fa-magnifying-glass"></i><input id="${escapeHtml(searchId)}" placeholder="${escapeHtml(placeholder)}" /></label><div class="pl-actions">${tabs}${actions}</div></section>`;
  },
  table({ columns = [], rows = [], empty = 'Sin registros' } = {}) {
    return DataTable({ columns: columns.map((c) => ({ ...c, align: c.num ? 'right' : c.align })), rows, empty });
  },
  card(title, body, icon = 'widgets') {
    return Section({ title, subtitle: '', children: body, actions: MI(icon) });
  },
  field({ name, label, value = '', type = 'text', placeholder = '' } = {}) {
    return Field({ name, labelKey: label, value, type, placeholder });
  }
};
