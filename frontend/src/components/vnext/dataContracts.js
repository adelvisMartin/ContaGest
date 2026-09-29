const DEFAULT_PAGE_SIZE=25;
const MAX_PAGE_SIZE=200;
const SORT_DIRECTIONS=new Set(['asc','desc']);
const FILTER_OPERATORS=new Set(['eq','ne','contains','startsWith','endsWith','lt','lte','gt','gte','in']);

function boundedPageSize(value=DEFAULT_PAGE_SIZE){
  const pageSize=Number(value);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE_SIZE) throw new RangeError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  return pageSize;
}

export function normalizePageQuery({page=1,pageSize=DEFAULT_PAGE_SIZE}={}){
  const normalizedPage=Number(page);
  if(!Number.isInteger(normalizedPage)||normalizedPage<1) throw new RangeError('page must be an integer >= 1');
  return {mode:'page',page:normalizedPage,pageSize:boundedPageSize(pageSize)};
}

export function normalizeCursorQuery({cursor='',pageSize=DEFAULT_PAGE_SIZE}={}){
  return {mode:'cursor',cursor:String(cursor??''),pageSize:boundedPageSize(pageSize)};
}

export function normalizeSortModel(model=[]){
  if(!Array.isArray(model)) return [];
  return model.map((item)=>{
    const field=String(item?.field??'').trim();
    const direction=String(item?.direction??item?.sort??'asc');
    if(!field) throw new TypeError('sort field is required');
    if(!SORT_DIRECTIONS.has(direction)) throw new TypeError(`unsupported sort direction: ${direction}`);
    return {field,direction};
  });
}

export function normalizeFilterModel(model=[]){
  if(!Array.isArray(model)) return [];
  return model.map((item)=>{
    const field=String(item?.field??'').trim();
    const operator=String(item?.operator??'eq');
    if(!field) throw new TypeError('filter field is required');
    if(!FILTER_OPERATORS.has(operator)) throw new TypeError(`unsupported filter operator: ${operator}`);
    const raw=item?.value;
    const value=Array.isArray(raw)?raw.map((entry)=>String(entry??'')):String(raw??'');
    return {field,operator,value};
  });
}

function encodeList(items,formatter){return items.map(formatter).join(',');}

export function serializeDataQuery({pagination={mode:'page',page:1,pageSize:DEFAULT_PAGE_SIZE},sort=[],filters=[],search=''}={}){
  const params=new URLSearchParams();
  const normalizedPagination=pagination?.mode==='cursor'?normalizeCursorQuery(pagination):normalizePageQuery(pagination);
  params.set('mode',normalizedPagination.mode);
  if(normalizedPagination.mode==='cursor'){
    if(normalizedPagination.cursor) params.set('cursor',normalizedPagination.cursor);
  }else{
    params.set('page',String(normalizedPagination.page));
  }
  params.set('pageSize',String(normalizedPagination.pageSize));
  const normalizedSort=normalizeSortModel(sort);
  if(normalizedSort.length) params.set('sort',encodeList(normalizedSort,(item)=>`${item.field}:${item.direction}`));
  const normalizedFilters=normalizeFilterModel(filters);
  if(normalizedFilters.length) params.set('filter',encodeList(normalizedFilters,(item)=>`${item.field}:${item.operator}:${Array.isArray(item.value)?item.value.join('|'):item.value}`));
  const normalizedSearch=String(search??'').trim();
  if(normalizedSearch) params.set('search',normalizedSearch);
  return params.toString();
}

export const DATA_QUERY_LIMITS=Object.freeze({defaultPageSize:DEFAULT_PAGE_SIZE,maxPageSize:MAX_PAGE_SIZE});