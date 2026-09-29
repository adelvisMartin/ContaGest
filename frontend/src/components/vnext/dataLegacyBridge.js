import { escapeHtml } from '../../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const alignClass=(column)=>column?.numeric||column?.align==='right'?' class="cg-u-text-mono cg-u-text-right"':'';

export function CgLegacyTable({columns=[],rows=[],caption='',emptyTitle='Sin datos',emptyDescription='',className=''}={}){
  const head=columns.map((column)=>`<th scope="col"${alignClass(column)}>${safe(column.label??column.key??column.field??'')}</th>`).join('');
  const body=rows.length?rows.map((row)=>`<tr>${columns.map((column)=>{const value=typeof column.render==='function'?column.render(row):safe(row?.[column.key??column.field]);return `<td${alignClass(column)}>${value??''}</td>`;}).join('')}</tr>`).join(''):`<tr><td colspan="${Math.max(1,columns.length)}"><div class="cgx-empty cg-data-no-results" role="status"><strong>${safe(emptyTitle)}</strong>${emptyDescription?`<p>${safe(emptyDescription)}</p>`:''}</div></td></tr>`;
  return `<div class="cg-ui-table-wrap cgx-table-wrap table-wrap cgx-table-normalized ${safe(className)}" data-cg-data-authority="CgTable"><table class="cg-ui-table">${caption?`<caption class="sr-only">${safe(caption)}</caption>`:''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function CgLegacyDataState({kind='loading',message='',retryAction=''}={}){
  const label=message||({loading:'Cargando…',error:'No se pudieron cargar los datos.',empty:'Sin datos',noResults:'Sin resultados'}[kind]||'Sin datos');
  return `<div class="cg-data-state cg-data-state-${safe(kind)}" role="${kind==='error'?'alert':'status'}"><strong>${safe(label)}</strong>${retryAction}</div>`;
}
