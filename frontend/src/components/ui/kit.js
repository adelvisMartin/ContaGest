import { escapeHtml } from '../../utils/dom.js';
import { verticalAsset } from '../../assets/verticalAssets.js';

const safe = (value) => escapeHtml(String(value ?? ''));
const rawAttrs = (attrs = '') => String(attrs || '');
const hasAttr = (attrs, name) => new RegExp(`\\b${name}\\s*=`).test(String(attrs || ''));
const materialAliases = {
  api:'fa-plug',domain:'fa-building',database:'fa-database',currency_exchange:'fa-money-bill-trend-up',
  health_and_safety:'fa-heart-pulse',cloud_sync:'fa-cloud-arrow-up',cloud_done:'fa-cloud-circle-check',
  inventory_2:'fa-boxes-stacked',receipt_long:'fa-receipt',account_balance:'fa-building-columns',
  account_balance_wallet:'fa-wallet',shopping_cart:'fa-cart-shopping',assessment:'fa-chart-simple',
  groups:'fa-users',payments:'fa-money-bill-transfer',badge:'fa-id-badge',rule:'fa-shield-halved',
  settings:'fa-gear',help:'fa-circle-question',logout:'fa-right-from-bracket',menu:'fa-bars',
  search:'fa-magnifying-glass',print:'fa-print',download:'fa-download',description:'fa-file-lines',
  expand_more:'fa-chevron-down',smart_toy:'fa-robot',notifications_active:'fa-bell',help_outline:'fa-circle-question',
  apps:'fa-grip',dashboard:'fa-chart-pie',sitemap:'fa-sitemap',pen_nib:'fa-pen-nib',
  chart_line:'fa-chart-line',building_columns:'fa-building-columns'
};
const faFamilies = new Set(['fa-solid','fa-regular','fa-brands','fa-light','fa-thin','fa-duotone','fa-sharp']);

function normalizeIconSpec(name = '') {
  const tokens=String(name||'').trim().split(/\s+/).filter(Boolean);
  const family=tokens.find((token)=>faFamilies.has(token))||'fa-solid';
  const explicitIcon=tokens.find((token)=>token.startsWith('fa-')&&!faFamilies.has(token));
  const aliasToken=tokens.find((token)=>!token.startsWith('fa-'))||'';
  const candidate=explicitIcon||materialAliases[aliasToken]||materialAliases[aliasToken.replace(/-/g,'_')]||'fa-circle-dot';
  return { family, icon:candidate.startsWith('fa-')?candidate:'fa-circle-dot' };
}

export const cx = (...classes) => classes.filter(Boolean).join(' ');
export const money = (value, currency = 'Bs.') => `${currency} ${Number(value || 0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const icon = (name = 'fa-circle-dot', className = '') => {
  const spec=normalizeIconSpec(name);
  return `<i class="${safe(spec.family)} ${safe(spec.icon)} ${safe(className)}" aria-hidden="true"></i>`;
};
export const Icon=(name,className='w-5')=>icon(name,className);
export const MaterialIcon=(name,className='')=>icon(name,className);

const toneMap=(tone='neutral')=>({slate:'neutral',brand:'brand',accent:'brand',success:'success',warning:'warning',danger:'danger',neutral:'neutral'}[tone]||tone||'neutral');
const normalizeVariant=(variant='primary')=>({accent:'primary',outline:'secondary',subtle:'secondary',tertiary:'ghost'}[variant]||variant||'primary');

export function Button(args={}){
  const label=args.label??args.text??'Acción';
  const iconName=args.iconName??args.icon??'';
  const variant=normalizeVariant(args.variant??'primary');
  const attrs=rawAttrs(args.attrs);
  const type=hasAttr(attrs,'type')?'':`type="${safe(args.type||'button')}"`;
  const id=args.id?`id="${safe(args.id)}"`:'';
  const route=args.route?`data-route="${safe(args.route)}"`:'';
  const className=safe(args.className||'');
  const i18n=args.i18n?`data-i18n="${safe(args.i18n)}"`:'';
  return `<button ${type} ${id} class="cgx-btn cgx-btn-${safe(variant)} btn btn-${safe(variant)} ${className}" ${route} ${attrs} data-mui-button-fallback data-cgx-kit="button">${iconName?icon(iconName):''}<span ${i18n}>${safe(label)}</span></button>`;
}

export function Badge(arg='',toneArg='neutral'){
  const label=typeof arg==='object'?(arg.label??''):arg;
  const tone=toneMap(typeof arg==='object'?arg.tone:toneArg);
  return `<span class="cgx-badge cgx-badge-${safe(tone)} badge" data-cgx-kit="badge">${safe(label)}</span>`;
}

export function PageHeader(args={}){
  const eyebrow=args.eyebrow??args.eyebrowKey??'ContaGest';
  const title=args.title??args.titleKey??'';
  const description=args.description??args.descKey??args.subtitle??'';
  const actions=args.actions||'';
  const meta=Array.isArray(args.meta)?args.meta:[];
  return `<header class="cgx-page-header" data-cgx-kit="page-header"><div class="cgx-page-copy"><div class="cgx-page-overline"><span class="cgx-eyebrow" ${args.eyebrowKey?`data-i18n="${safe(args.eyebrowKey)}"`:''}>${safe(eyebrow)}</span></div><h1 ${args.titleKey?`data-i18n="${safe(args.titleKey)}"`:''}>${safe(title)}</h1>${description?`<p ${args.descKey?`data-i18n="${safe(args.descKey)}"`:''}>${safe(description)}</p>`:''}${meta.length?`<div class="cgx-meta-row">${meta.map((item)=>`<span>${safe(item)}</span>`).join('')}</div>`:''}</div>${actions?`<div class="cgx-page-actions">${actions}</div>`:''}</header>`;
}

export function MetricCard({label='',value='-',hint='',iconName='fa-chart-simple',tone='brand',trend=''}={}){
  const normalized=toneMap(tone);
  return `<article class="cgx-metric cgx-metric-${safe(normalized)}" data-cgx-kit="metric"><div class="cgx-metric-top"><span class="cgx-metric-icon">${icon(iconName)}</span>${trend?`<span class="cgx-trend">${safe(trend)}</span>`:''}</div><div class="cgx-metric-main"><p>${safe(label)}</p><strong>${safe(value)}</strong>${hint?`<small>${safe(hint)}</small>`:''}</div></article>`;
}
export const MetricGrid=(items=[])=>`<section class="cgx-metric-grid" data-cgx-kit="metric-grid">${items.map((item)=>MetricCard(item)).join('')}</section>`;
export const KpiCard=({labelKey='',valueId='',subId='',icon:iconName='fa-chart-simple',value='-',sub='',className=''}={})=>`<article class="cgx-metric kpi ${safe(className)}" data-cgx-kit="kpi"><div class="cgx-metric-top"><span class="cgx-metric-icon">${icon(iconName)}</span></div><div class="cgx-metric-main"><p data-i18n="${safe(labelKey)}">${safe(labelKey)}</p><strong id="${safe(valueId)}">${safe(value)}</strong>${subId?`<small id="${safe(subId)}">${safe(sub)}</small>`:''}</div></article>`;
export const StatCard=({label='',value='-',icon:iconName='fa-chart-line',hint='',tone='brand'}={})=>MetricCard({label,value,iconName,hint,tone});
export const EnterpriseKpi=({label='',value='-',sub='',trend='',tone='neutral'}={})=>MetricCard({label,value,hint:sub,iconName:'fa-chart-simple',tone,trend});

export function Section({title='',subtitle='',actions='',children='',className=''}={}){
  return `<section class="cgx-section ${safe(className)}" data-cgx-kit="section"><header class="cgx-section-head"><div><h2>${safe(title)}</h2>${subtitle?`<p>${safe(subtitle)}</p>`:''}</div>${actions?`<div class="cgx-section-actions">${actions}</div>`:''}</header><div class="cgx-section-body">${children}</div></section>`;
}

export function DataTable({columns=[],rows=[],empty='Sin datos'}={}){
  const renderCell=(row,column)=>column.render?column.render(row):safe(row[column.key]);
  return `<div class="cgx-table-wrap table-wrap cgx-table-normalized" data-cgx-kit="table"><table class="cgx-table table"><thead><tr>${columns.map((column)=>`<th scope="col" class="${column.align==='right'?'is-right':''}">${safe(column.label||column.key)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map((row)=>`<tr>${columns.map((column)=>`<td class="${column.align==='right'?'is-right cgx-num':''}">${renderCell(row,column)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length||1}" class="cgx-empty-cell">${safe(empty)}</td></tr>`}</tbody></table></div>`;
}
export function Table({headers=[],rows=[],emptyKey='noData'}={}){
  return `<div class="cgx-table-wrap table-wrap cgx-table-normalized" data-cgx-kit="table"><table class="cgx-table table"><thead><tr>${headers.map((header)=>`<th scope="col" ${header.key?`data-i18n="${safe(header.key)}"`:''}>${safe(header.label||header.key||'')}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length||1}" class="cgx-empty-cell text-center" data-i18n="${safe(emptyKey)}">Sin datos</td></tr>`}</tbody></table></div>`;
}
export const FiscalTable=({headers=[],rows=[]}={})=>Table({headers:headers.map((label)=>({label})),rows});

export function Field({labelKey='',name='',id='',type='text',required=false,placeholderKey='',placeholder='',value='',attrs='',className='',inputClass=''}={}){
  const inputId=id||`field-${String(name||'input').replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  return `<div class="cgx-field ${safe(className)}" data-cgx-kit="field"><label class="label cgx-label" for="${safe(inputId)}" ${labelKey?`data-i18n="${safe(labelKey)}"`:''}>${safe(labelKey)}</label><input id="${safe(inputId)}" name="${safe(name)}" type="${safe(type)}" ${required?'required':''} value="${safe(value)}" ${placeholderKey?`data-i18n-placeholder="${safe(placeholderKey)}"`:''} ${placeholder?`placeholder="${safe(placeholder)}"`:''} class="input cgx-field-normalized ${safe(inputClass)}" ${rawAttrs(attrs)} /></div>`;
}
export function Textarea({labelKey='',name='',placeholderKey='',placeholder='',value='',required=false,className='',attrs=''}={}){
  const inputId=`field-${String(name||'textarea').replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  return `<div class="cgx-field ${safe(className)}" data-cgx-kit="textarea"><label class="label cgx-label" for="${safe(inputId)}" ${labelKey?`data-i18n="${safe(labelKey)}"`:''}>${safe(labelKey)}</label><textarea id="${safe(inputId)}" name="${safe(name)}" ${required?'required':''} ${placeholderKey?`data-i18n-placeholder="${safe(placeholderKey)}"`:''} ${placeholder?`placeholder="${safe(placeholder)}"`:''} class="textarea cgx-field-normalized" ${rawAttrs(attrs)}>${safe(value)}</textarea></div>`;
}
export function Select({labelKey='',name='',options=[],value='',className='',attrs=''}={}){
  const inputId=`field-${String(name||'select').replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  return `<div class="cgx-field ${safe(className)}" data-cgx-kit="select"><label class="label cgx-label" for="${safe(inputId)}" ${labelKey?`data-i18n="${safe(labelKey)}"`:''}>${safe(labelKey)}</label><select id="${safe(inputId)}" name="${safe(name)}" class="select cgx-field-normalized mui-fallback-select" ${rawAttrs(attrs)}>${options.map((option)=>`<option value="${safe(option.value)}" ${String(option.value)===String(value)?'selected':''}>${safe(option.label??option.value)}</option>`).join('')}</select></div>`;
}

export function EmptyState({title='Sin datos',description='',iconName='',icon:iconArg='',assetKey=''}={}){
  const asset=verticalAsset(assetKey);
  return `<div class="cgx-empty" data-cgx-kit="empty">${asset?`<img class="cgx-empty-asset" src="${safe(asset)}" alt="" aria-hidden="true">`:`<span class="cgx-empty-icon">${icon(iconName||iconArg||'fa-inbox')}</span>`}<strong>${safe(title)}</strong>${description?`<p>${safe(description)}</p>`:''}</div>`;
}
export function Toolbar({title='',searchPlaceholder='Buscar...',actions=''}={}){
  return `<div class="cgx-toolbar" data-cgx-kit="toolbar"><strong>${safe(title)}</strong><label class="cgx-toolbar-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="${safe(searchPlaceholder)}" /></label><div class="cgx-toolbar-actions">${actions}</div></div>`;
}
export function Timeline(items=[]){
  return `<div class="cgx-timeline" data-cgx-kit="timeline">${items.map((item)=>`<article><span class="cgx-timeline-dot"></span><div><strong>${safe(item.title)}</strong><p>${safe(item.description||'')}</p><small>${safe(item.time||'')}</small></div></article>`).join('')}</div>`;
}

export const TopIconButton=({icon:iconName,label,route='',action='',endpoint=''}={})=>`<button type="button" class="hf-icon-button icon-action-button cgx-btn-icon" aria-label="${safe(label)}" ${route?`data-route="${safe(route)}"`:''} ${action?`data-backend-action="${safe(action)}"`:''} ${endpoint?`data-endpoint="${safe(endpoint)}"`:''}>${icon(iconName)}</button>`;
export const EnterpriseButton=({text='',icon:iconName='',variant='primary',id='',attrs='',className=''}={})=>Button({id,text,icon:iconName,variant,attrs,className,type:'button'});
export const EnterpriseShellHeader=({title,subtitle='',actions=''}={})=>PageHeader({eyebrow:'ContaGest',title,description:subtitle,actions});

export const DS={
  Button({id='',label='',iconName='',variant='primary',attrs='',className=''}={}){return Button({id,label,iconName,variant,attrs,className,type:'button'});},
  PageHeader({title='',subtitle='',actions=''}={}){return PageHeader({eyebrow:'ContaGest',title,description:subtitle,actions});},
  Kpi({label='',value='-',sub='',tone='neutral',iconName=''}={}){return MetricCard({label,value,hint:sub,tone,iconName:iconName||'fa-chart-simple'});},
  Table({columns=[],rows=[],empty='Sin datos'}={}){return DataTable({columns,rows,empty});},
  Form({id='',fields=[],submitLabel='Guardar'}={}){return `<form id="${safe(id)}" class="cgx-form-normalized ds-form" data-cgx-kit="form"><div class="cg-record-fields">${fields.map((field)=>Field({labelKey:field.label,name:field.name,type:field.type||'text',placeholder:field.placeholder||'',value:field.value||'',required:Boolean(field.required)})).join('')}</div>${Button({text:submitLabel,icon:'fa-floppy-disk',type:'submit'})}</form>`;},
  ResourcePage({title='',subtitle='',actions='',kpis=[],columns=[],rows=[]}={}){return `<section class="cgx-page ds-resource-page" data-cgx-kit="resource-page">${DS.PageHeader({title,subtitle,actions})}${MetricGrid(kpis.map((k)=>({...k,hint:k.sub,iconName:k.iconName})))}${DataTable({columns,rows})}</section>`;}
};

export const UI={icon,Button,Badge,PageHeader,MetricCard,MetricGrid,Section,DataTable,EmptyState,Toolbar,Timeline,KpiCard,StatCard,Field,Select,Textarea,Table,FiscalTable,EnterpriseButton,EnterpriseKpi,EnterpriseShellHeader,TopIconButton,MaterialIcon,Icon,DS};
