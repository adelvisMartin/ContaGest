/**
 * Third reference: authenticated group balance consolidator.
 * All money is read from existing local Hípico ledger projections.
 * Columns in native movement currencies are NEVER summed into base currency.
 */
import {
  activeGroupId, groupProfile, scopeItems, participantAvailableAt,
  participantAval, participantRaceDelta, participantStatement
} from './operational-ledger.js';
import { assertReportDate, projectDailyMovements, projectRaceHistory } from './reference-report-projections.js';

export const CONSOLIDATOR_COLUMNS = Object.freeze([
  { id: 'participant', label: 'Participante' },
  { id: 'available', label: 'Disponible' },
  { id: 'today', label: 'Jugadas hoy · neto' },
  { id: 'week', label: 'Jugadas semana · neto' },
  { id: 'refund', label: 'Devolución' },
  { id: 'deposit', label: 'Depósitos' },
  { id: 'withdrawal', label: 'Retiros' },
  { id: 'transfer', label: 'Transferencias · neto' },
  { id: 'aval', label: 'Aval vigente' }
]);
const financialColumns = CONSOLIDATOR_COLUMNS.map(c => c.id).filter(id => id !== 'participant');
const CURRENCY_COLUMNS = new Set(['refund','deposit','withdrawal','transfer']);
const DEFAULT_PAGE_SIZE = 21;

function minor(value) {
  const scaled = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(scaled)) throw new Error('Importe fuera del rango de precisión monetaria.');
  return scaled;
}
function sumMinor(values) {
  const sum = values.reduce((v, x) => v + minor(x), 0);
  if (!Number.isSafeInteger(sum)) throw new Error('Suma monetaria fuera de rango.');
  return sum / 100;
}
function addNative(target, currency, amount) {
  const code = String(currency || '').toUpperCase();
  if (!/^[A-Z.]{2,8}$/.test(code)) throw new Error('Moneda de movimiento inválida.');
  const next = (target.get(code) || 0) + minor(amount);
  if (!Number.isSafeInteger(next)) throw new Error('Suma monetaria fuera de rango.');
  target.set(code,next);
}
function toCurrencyAmounts(map) {
  return Object.fromEntries([...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([code,cents])=>[code,cents/100]));
}
function amountParts(row, col) {
  if(CURRENCY_COLUMNS.has(col)) return Object.values(row[col] || {});
  if(col === 'participant' || row[col] === null) return [];
  return [row[col]];
}
function score(row, col) {
  const parts=amountParts(row,col);
  return parts.length ? sumMinor(parts) : null;
}
export function consolidateFilterDefaults() {
  return { search:'', signColumn:'available', sign:'all', hideInactive:true,
    sortColumn:'participant', sortDirection:'asc', page:1,
    columnOrder:CONSOLIDATOR_COLUMNS.map(c=>c.id) };
}
export function validateColumnOrder(order) {
  const base=CONSOLIDATOR_COLUMNS.map(c=>c.id);
  return Array.isArray(order) && order.length===base.length &&
    new Set(order).size===base.length && order.every(id=>base.includes(id))
    ? [...order] : base;
}
export function moveConsolidatorColumn(current,id,step) {
  const order=validateColumnOrder(current);
  const i=order.indexOf(id),dest=i+step;
  if(i<0 || !Number.isInteger(step) || Math.abs(step)!==1 || dest<0 || dest>=order.length)
    return order;
  [order[i],order[dest]]=[order[dest],order[i]];
  return order;
}

function weekStart(date) {
  const dt = new Date(date+'T12:00:00.000Z');
  const offset=(dt.getUTCDay()+6)%7;
  dt.setUTCDate(dt.getUTCDate()-offset);
  return dt.toISOString().slice(0,10);
}
function totalsFor(rows, refundSupported, baseCurrency) {
  const sums={available:0,today:0,week:0,aval:0,
    refund:refundSupported?new Map():null,
    deposit:new Map(),withdrawal:new Map(),transfer:new Map()};
  for(const row of rows){
    for(const k of ['available','today','week','aval'])
      sums[k]+=minor(row[k]);
    for(const key of ['refund','deposit','withdrawal','transfer']){
      if(!sums[key])continue;
      for(const [currency,amount] of Object.entries(row[key]||{})) addNative(sums[key],currency,amount);
    }
  }
  return {
    participantCount:rows.length,baseCurrency,
    ...Object.fromEntries(['available','today','week','aval'].map(id=>[id,sums[id]/100])),
    ...Object.fromEntries(['refund','deposit','withdrawal','transfer']
      .map(id=>[id,sums[id] ? toCurrencyAmounts(sums[id]):null]))
  };
}

/**
 * Returned pageRows are the exact records rendered AND exported.
 * allTotals always cover this selected group, filteredTotals cover the matching
 * subset BEFORE paging; nothing is normalized into a fictitious currency.
 */
export function projectConsolidatedBalances(workspace,options={}) {
  const groupId=String(options.groupId||activeGroupId(workspace));
  const date=assertReportDate(options.date);
  const group=(workspace?.config?.groups||workspace?.config?.whatsappGroups||[])
    .find(g=>String(g.id)===groupId);
  if(!group) throw new Error('Grupo no autorizado para el consolidador.');
  const movementModel=projectDailyMovements(workspace,{groupId,date});
  const raceModel=projectRaceHistory(workspace,{groupId,date});
  if(movementModel.invalidReferences||raceModel.invalidReferences)
    throw new Error('El consolidado tiene referencias financieras fuera de grupo. Conciliar antes de mostrar o exportar.');
  const groupParticipants=scopeItems(workspace,workspace?.participants||[],groupId);
  const raceList=scopeItems(workspace,workspace?.races||[],groupId);
  const moved=scopeItems(workspace,workspace?.movements||[],groupId);
  const memberIds=new Set(groupParticipants.map(p=>String(p.id)));
  const everyMemberId=(workspace.participants||[]).map(p=>String(p.id));
  if(new Set(everyMemberId).size!==everyMemberId.length)
    throw new Error('Existen IDs de participante repetidos entre grupos. Corrige antes de consolidar.');
  // The historical balance replays ALL rows through the cutoff; validating
  // only the selected day would silently incorporate foreign-group old money.
  for(const race of raceList.filter(r=>String(r.date||'')<=date)){
    for(const bet of race.bets||[]){
      if(!memberIds.has(String(bet.playerId)) ||
        (bet.receiverId&&!memberIds.has(String(bet.receiverId))))
        throw new Error('Hay apuestas históricas fuera del grupo; no es seguro calcular el saldo.');
    }
  }
  for(const m of moved.filter(m=>String(m.date||'')<=date)){
    if(!memberIds.has(String(m.participantId)) ||
      (m.type==='transfer'&&!memberIds.has(String(m.counterpartyId))))
      throw new Error('Hay movimientos históricos fuera del grupo; no es seguro calcular el saldo.');
  }
  const from=weekStart(date);
  const raceWeek=raceList.filter(r=>r.date>=from && r.date<=date);
  const byParticipant=new Map(groupParticipants.map(p=>[String(p.id),{
    participant:p, dayActivity:false, deposit:new Map(),withdrawal:new Map(),
    transfer:new Map(),refund:new Map()
  }]));
  const refundSupported=moved.some(m=>['refund','return','devolucion'].includes(String(m.type).toLowerCase()));
  for(const race of raceModel.races){
    for(const bet of race.bets){
      const src=byParticipant.get(bet.player.id);
      const dst=bet.receiver?byParticipant.get(bet.receiver.id):null;
      if(src)src.dayActivity=true;
      if(dst)dst.dayActivity=true;
    }
  }
  for(const m of movementModel.movements){
    const sender=byParticipant.get(m.participant.id);
    if(!sender)throw new Error('Participante origen fuera de grupo.');
    sender.dayActivity=true;
    const kind=String(m.type).toLowerCase();
    if(m.status==='cancelled')continue;
    if(kind==='transfer'){
      const receiver=m.counterparty?byParticipant.get(m.counterparty.id):null;
      if(!receiver)throw new Error('Transferencia con destino ajeno al grupo.');
      receiver.dayActivity=true;
      addNative(sender.transfer,m.currency,-m.amount);
      addNative(receiver.transfer,m.currency,m.amount);
    }else if(kind==='deposit'||kind==='withdrawal'||['refund','return','devolucion'].includes(kind)){
      const key=kind==='deposit'?'deposit':kind==='withdrawal'?'withdrawal':'refund';
      addNative(sender[key],m.currency,m.amount);
    }
  }
  const rows=groupParticipants.map((p)=>{
    const data=byParticipant.get(String(p.id));
    const id=String(p.id);
    const statement=participantStatement(workspace,id,date);
    const today=sumMinor(raceModel.races.map(r=>{
      const raw=raceList.find(s=>String(s.id)===r.id);
      return participantRaceDelta(raw,id);
    }));
    const week=sumMinor(raceWeek.map(r=>participantRaceDelta(r,id)));
    return {
      id,code:String(p.code||''),name:String(p.name||p.code||''),
      available:participantAvailableAt(workspace,p,date),today,week,
      refund:refundSupported?toCurrencyAmounts(data.refund):null,
      deposit:toCurrencyAmounts(data.deposit),
      withdrawal:toCurrencyAmounts(data.withdrawal),
      transfer:toCurrencyAmounts(data.transfer),
      aval:participantAval(workspace,p,date),
      dayActivity:data.dayActivity,
      // This is a consistency check, not a second source of monetary authority.
      statementDate:statement.date
    };
  });
  const search=String(options.search||'').trim().toLocaleLowerCase('es-VE').slice(0,120);
  const signColumn=financialColumns.includes(options.signColumn)?options.signColumn:'available';
  const sign=['all','positive','negative','zero'].includes(options.sign)?options.sign:'all';
  const hideInactive=options.hideInactive===undefined?true:options.hideInactive===true;
  const sortColumn=CONSOLIDATOR_COLUMNS.some(c=>c.id===options.sortColumn)?options.sortColumn:'participant';
  const sortDirection=options.sortDirection==='desc'?'desc':'asc';
  const matching=rows.filter(r=>{
    if(search && !(r.code+' '+r.name).toLocaleLowerCase('es-VE').includes(search))return false;
    if(hideInactive&&!r.dayActivity)return false;
    if(sign==='all')return true;
    const parts=amountParts(r,signColumn);
    if(!parts.length)return false; // Unknown refund is never classified as zero.
    return sign==='positive'?parts.some(v=>v>0):
      sign==='negative'?parts.some(v=>v<0):parts.every(v=>v===0);
  }).sort((a,b)=>{
    const aScore=score(a,sortColumn),bScore=score(b,sortColumn);
    let diff=sortColumn==='participant'
      ? (a.code+' '+a.name).localeCompare(b.code+' '+b.name,'es')
      :aScore===null && bScore===null?0:aScore===null?1:bScore===null?-1:aScore-bScore;
    if(diff===0)diff=a.id.localeCompare(b.id);
    return sortDirection==='desc'?-diff:diff;
  });
  const pageSize=DEFAULT_PAGE_SIZE;
  const pages=Math.max(1,Math.ceil(matching.length/pageSize));
  const requested=Number(options.page);
  const page=Number.isSafeInteger(requested)?Math.max(1,Math.min(pages,requested)):1;
  return {
    groupId,date,groupName:String(group.companyName||group.name||'Control Hípico'),
    baseCurrency:String(group.currency||groupProfile(workspace,groupId).currency||'Bs.'),
    rows,matching,pageRows:matching.slice((page-1)*pageSize,page*pageSize),
    allTotals:totalsFor(rows,refundSupported,String(group.currency||'Bs.')),
    filteredTotals:totalsFor(matching,refundSupported,String(group.currency||'Bs.')),
    totalCount:rows.length,matchingCount:matching.length,
    refundSupported,source:'local-workspace-projection',page,pages,pageSize,
    options:{ search,signColumn,sign,hideInactive,sortColumn,sortDirection,
      columnOrder:validateColumnOrder(options.columnOrder)}
  };
}
