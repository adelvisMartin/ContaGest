import { number } from './format.js';
import { escapeHtml } from './ui.js';
import { CONSOLIDATOR_COLUMNS } from './reference-report-consolidator.js';

const esc=value=>escapeHtml(String(value??''));
const labels=Object.fromEntries(CONSOLIDATOR_COLUMNS.map(c=>[c.id,c.label]));
const monetary=new Set(['refund','deposit','withdrawal','transfer']);
function native(value){
  if(value===null)return 'No disponible';
  const rows=Object.entries(value||{});
  return rows.length?rows.map(([c,a])=>c+' '+number(a)).join(' / '):'—';
}
function cell(row,id,currency){
  if(id==='participant')return row.code+' · '+row.name;
  return monetary.has(id)?native(row[id]):currency+' '+number(row[id]);
}
function signClass(row,id){
  const values=monetary.has(id)?Object.values(row[id]||{}):[row[id]];
  return values.some(x=>x<0)?'amount-negative':values.some(x=>x>0)?'amount-positive':'';
}
export function consolidatedVisibleMatrix(model){
  const keys=model.options.columnOrder;
  return [keys.map(id=>labels[id]),...model.pageRows.map(row=>keys.map(id=>cell(row,id,model.baseCurrency)))];
}
export function consolidatedVisibleText(model){
  const safe=v=>{
    const s=String(v??'').replace(/[\t\r\n]+/g,' ');
    return /^\s*[=+\-@]/.test(s)?"'"+s:s;
  };
  const heading=[model.groupName+' · '+model.date,'Página '+model.page+'/'+model.pages];
  return [heading,...consolidatedVisibleMatrix(model)].map(row=>row.map(safe).join('\t')).join('\n');
}
export function consolidatedVisiblePdfLines(model){
  const lines=[
    model.groupName+' / '+model.date+' / Consolidado',
    'Pagina '+model.page+'/'+model.pages+'; filas '+model.pageRows.length,
    'Disponible, aval, jugadas: '+model.baseCurrency+'; otros movimientos: moneda original',
    'Devolucion: '+(model.refundSupported?'asientos explicitamente clasificados':'SIN FUENTE'),
    ''
  ];
  for(const row of model.pageRows){
    lines.push(row.code+' / '+row.name);
    for(const id of model.options.columnOrder.filter(id=>id!=='participant'))
      lines.push('  '+labels[id]+': '+cell(row,id,model.baseCurrency));
    lines.push('');
  }
  return lines;
}
function selectOptions(columns,selected){
  return columns.map(c=>'<option value="'+esc(c.id)+'" '+(selected===c.id?'selected':'')+'>'+esc(c.label)+'</option>').join('');
}
function amounts(totals){
  return '<div class="reference-consolidator__totals">'+CONSOLIDATOR_COLUMNS
    .filter(c=>c.id!=='participant')
    .map(c=>'<div><small>'+esc(c.label)+'</small><strong>'+
      esc(monetary.has(c.id)?native(totals[c.id]):totals.baseCurrency+' '+number(totals[c.id]))+
      '</strong></div>').join('')+'</div>';
}
export function renderConsolidator(model,presentation={}){
  const f=model.options;
  const opts=CONSOLIDATOR_COLUMNS.filter(c=>c.id!=='participant');
  const head=f.columnOrder.map((id,i)=>{
    return '<th scope="col"><div class="reference-consolidator__th"><span>'+esc(labels[id])+'</span>'+
      '<div class="reference-consolidator__reorder">'+
      '<button type="button" class="button button--small" data-action="consolidator-move-column" data-id="'+esc(id)+
      '" data-step="-1" '+(i===0?'disabled':'')+' aria-label="Mover '+esc(labels[id])+' a la izquierda">←</button>'+
      '<button type="button" class="button button--small" data-action="consolidator-move-column" data-id="'+esc(id)+
      '" data-step="1" '+(i===f.columnOrder.length-1?'disabled':'')+' aria-label="Mover '+esc(labels[id])+' a la derecha">→</button>'+
      '</div></div></th>';
  }).join('');
  const body=model.pageRows.map(row=>
    '<tr>'+f.columnOrder.map(id=>'<td class="'+signClass(row,id)+'">'+esc(cell(row,id,model.baseCurrency))+'</td>').join('')+'</tr>'
  ).join('')||'<tr><td colspan="'+f.columnOrder.length+'">No hay cuentas para estos filtros.</td></tr>';
  const signOpts=[['all','Todos'],['positive','Positivos'],['negative','Negativos'],['zero','Cero']]
    .map(([key,title])=>'<option value="'+key+'" '+(f.sign===key?'selected':'')+'>'+title+'</option>').join('');
  const refreshText=presentation.busy?'Consultando…':'Actualizar';
  const refreshDisabled=presentation.busy?'disabled aria-busy="true"':'';
  return [
    '<section class="reference-consolidator" aria-label="Consolidador de cuentas del grupo">',
    '<div class="page-head"><div><h2>Consolidador de saldos</h2><p>'+esc(model.groupName)+' · '+esc(model.date)+
      ' · Datos internos del grupo seleccionado</p></div><div class="page-actions">',
    '<button type="button" class="button" data-action="consolidator-copy">Copiar Excel</button>',
    '<button type="button" class="button" data-action="consolidator-xlsx">Excel (.xlsx)</button>',
    '<button type="button" class="button" data-action="consolidator-pdf">PDF</button>',
    '<button type="button" class="button" data-action="consolidator-png">Imagen PNG</button></div></div>',
    '<form id="consolidator-filter-form" class="card reference-consolidator__filters"><div class="card__body">',
    '<div class="field"><label for="hc-cons-date">Fecha</label><input id="hc-cons-date" type="date" required class="input" name="date" value="'+esc(model.date)+'"></div>',
    '<div class="field"><label for="hc-cons-search">Buscar cuenta</label><input id="hc-cons-search" type="search" class="input" name="search" maxlength="120" value="'+esc(f.search)+'" placeholder="Código o nombre"></div>',
    '<div class="field"><label for="hc-cons-col">Columna</label><select id="hc-cons-col" class="select" name="signColumn">'+selectOptions(opts,f.signColumn)+'</select></div>',
    '<div class="field"><label for="hc-cons-sign">Signo</label><select id="hc-cons-sign" class="select" name="sign">'+signOpts+'</select></div>',
    '<div class="field"><label for="hc-cons-sort">Ordenar por</label><select id="hc-cons-sort" class="select" name="sortColumn">'+selectOptions(CONSOLIDATOR_COLUMNS,f.sortColumn)+'</select></div>',
    '<div class="field"><label for="hc-cons-direction">Dirección</label><select id="hc-cons-direction" class="select" name="sortDirection">'+
      '<option value="asc" '+(f.sortDirection==='asc'?'selected':'')+'>Ascendente</option><option value="desc" '+(f.sortDirection==='desc'?'selected':'')+'>Descendente</option></select></div>',
    '<label class="reference-consolidator__toggle"><input type="checkbox" name="hideInactive" '+(f.hideInactive?'checked':'')+'> Ocultar sin movimientos</label>',
    '<div class="reference-report__actions"><button class="button button--primary" type="submit">Ver</button>',
    '<button type="button" class="button" data-action="consolidator-today">Hoy</button>',
    '<button type="button" class="button" data-action="consolidator-clear">Limpiar filtros</button>',
    '<button type="button" class="button" data-action="reference-report-refresh" '+refreshDisabled+'>'+refreshText+'</button></div>',
    '</div></form>',
    '<p role="status" class="muted">'+esc(presentation.status||'Datos del dispositivo; no sincronización en vivo.')+
      (presentation.checkedAt?' · Última consulta: '+esc(presentation.checkedAt):'')+'</p>',
    '<div class="reference-consolidator__counts" aria-live="polite"><strong>'+model.totalCount+
      ' cuentas del grupo</strong><strong>'+model.matchingCount+' cumplen filtros</strong><span>'+
      model.pageRows.length+' visibles · Página '+model.page+' de '+model.pages+'</span></div>',
    !model.refundSupported?'<p class="notice">Devolución: no hay un tipo de asiento identificable en el workspace. «No disponible» no es cero.</p>':'',
    '<section class="card"><div class="card__head"><h3>Totales del grupo completo</h3><small>Sin filtrar</small></div><div class="card__body">'+
      amounts(model.allTotals)+'</div></section>',
    '<section class="card"><div class="card__head"><h3>Totales de las cuentas filtradas</h3><small>Antes de paginar</small></div><div class="card__body">'+
      amounts(model.filteredTotals)+'</div></section>',
    '<section class="card"><div class="card__head"><h3>Tabla por participante</h3><small>Las exportaciones contienen la página visible en este orden.</small></div>',
    '<div class="card__body"><div class="table-wrap reference-consolidator__table-wrap"><table class="summary-table reference-consolidator__table">',
    '<thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>',
    '<div class="reference-consolidator__pages"><button type="button" class="button" data-action="consolidator-page" data-page="'+(model.page-1)+'" '+(model.page<=1?'disabled':'')+'>Anterior</button>'+
      '<span>Página '+model.page+' / '+model.pages+'</span>'+
      '<button type="button" class="button" data-action="consolidator-page" data-page="'+(model.page+1)+'" '+(model.page>=model.pages?'disabled':'')+'>Siguiente</button></div></div></section>',
    '<p class="muted">Jugadas hoy/semana = neto liquidado, no volumen de apuestas. Depósitos, retiros y transferencias no mezclan monedas; disponible y aval usan '+esc(model.baseCurrency)+' del cálculo vigente.</p>',
    '</section>'
  ].join('');
}
