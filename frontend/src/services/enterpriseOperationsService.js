import { BackendApi } from './backendApi.js';

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key,value]) => {
    const text = String(value ?? '').trim();
    if (text && text !== 'all') search.set(key,text);
  });
  const result = search.toString();
  return result ? `?${result}` : '';
};

export const TasksService = {
  list(filters = {}) { return BackendApi.get(`/tasks${queryString({ q:filters.search, status:filters.status })}`); },
  create(data) { return BackendApi.post('/tasks', data); },
  update(id,data) { return BackendApi.put(`/tasks/${encodeURIComponent(id)}`,data); },
  setStatus(id,status) { return BackendApi.request(`/tasks/${encodeURIComponent(id)}/status`,{method:'PATCH',body:{status}}); },
  archive(id) { return BackendApi.delete(`/tasks/${encodeURIComponent(id)}`); }
};

const mapAccount = (account) => ({
  ...account,
  bank:account.bank || account.bankName,
  account:account.account || account.accountNo,
  openingBalance:Number(account.openingBalance ?? account.balance ?? 0),
  balance:Number(account.balance ?? 0)
});
const mapMovement = (movement) => ({
  ...movement,
  amount:Number(movement.amount ?? (Number(movement.credit||0)>0 ? movement.credit : movement.debit) ?? 0),
  type:movement.type || (Number(movement.credit||0)>0 ? 'income' : 'expense'),
  reconciled:Boolean(movement.reconciled ?? movement.matched)
});

export const BankingService = {
  async summary() {
    const result = await BackendApi.get('/banking/summary');
    return { ...result, accounts:(result.accounts||[]).map(mapAccount), movements:(result.movements||[]).map(mapMovement) };
  },
  async listMovements(filters = {}) {
    const rows = await BackendApi.get(`/banking/movements${queryString({ q:filters.search,status:filters.status,accountId:filters.accountId,take:filters.take })}`);
    return (rows||[]).map(mapMovement);
  },
  async createAccount(data) {
    return mapAccount(await BackendApi.create('bank-accounts',{
      bankName:data.bank,
      accountNo:data.account,
      currency:data.currency,
      balance:Number(data.openingBalance||0),
      active:true
    }));
  },
  createMovement(data) { return BackendApi.post('/banking/movements',{...data,amount:Number(data.amount||0)}).then(mapMovement); },
  reconcile(id,matched) { return BackendApi.request(`/banking/movements/${encodeURIComponent(id)}/reconcile`,{method:'PATCH',body:{matched}}).then(mapMovement); },
  removeMovement(id) { return BackendApi.delete(`/banking/movements/${encodeURIComponent(id)}`); }
};

const mapEmployee = (employee) => ({
  ...employee,
  document:employee.document || employee.idNumber,
  salary:Number(employee.salary||0),
  department:employee.department || '',
  hiredAt:employee.hiredAt || null,
  active:employee.active !== false
});
const mapReceipt = (receipt) => ({
  ...receipt,
  gross:Number(receipt.gross||0), deductions:Number(receipt.deductions||0), net:Number(receipt.net||0),
  employee:receipt.employee?.fullName || receipt.employee,
  employeeId:receipt.employeeId,
  result:{ gross:Number(receipt.gross||0),totalDeductions:Number(receipt.deductions||0),net:Number(receipt.net||0) },
  ...((receipt.details && typeof receipt.details === 'object') ? receipt.details : {})
});
const mapPeriod = (period) => ({
  ...period,
  totalGross:Number(period.totalGross||0),totalDeductions:Number(period.totalDeductions||0),totalNet:Number(period.totalNet||0),
  receipts:(period.receipts||[]).map(mapReceipt)
});

export const PayrollService = {
  async employees(search = '') { return (await BackendApi.list('employees',search) || []).map(mapEmployee); },
  createEmployee(data) {
    return BackendApi.create('employees',{
      idNumber:data.document,
      fullName:data.fullName,
      position:data.position || 'Colaborador',
      department:data.department || undefined,
      hiredAt:data.hiredAt || undefined,
      salary:Number(data.salary||0),
      active:true
    }).then(mapEmployee);
  },
  updateEmployee(id,data) {
    return BackendApi.put(`/employees/${encodeURIComponent(id)}`,{
      ...(data.document !== undefined ? { idNumber:data.document } : {}),
      ...(data.fullName !== undefined ? { fullName:data.fullName } : {}),
      ...(data.position !== undefined ? { position:data.position } : {}),
      ...(data.department !== undefined ? { department:data.department } : {}),
      ...(data.hiredAt !== undefined ? { hiredAt:data.hiredAt || null } : {}),
      ...(data.salary !== undefined ? { salary:Number(data.salary||0) } : {}),
      ...(data.active !== undefined ? { active:Boolean(data.active) } : {})
    }).then(mapEmployee);
  },
  removeEmployee(id) { return BackendApi.delete(`/employees/${encodeURIComponent(id)}`); },
  async periods(status = '') { return (await BackendApi.get(`/payroll/periods${queryString({status})}`) || []).map(mapPeriod); },
  createPeriod(period) { return BackendApi.post('/payroll/periods',{period}).then(mapPeriod); },
  createReceipt(data) {
    const details = {
      date:data.date,
      days:Number(data.days||0),
      overtimeHours:Number(data.overtimeHours||0),
      bonus:Number(data.bonus||0),
      deductionsExtra:Number(data.deductionsExtra||0),
      employerContributions:Number(data.employerContributions||0),
      department:data.department || ''
    };
    return BackendApi.post('/payroll/receipts',{
      periodId:data.periodId || undefined,
      period:data.periodId ? undefined : data.period,
      employeeId:data.employeeId,
      gross:Number(data.gross||0),
      deductions:Number(data.deductions||0),
      net:Number(data.net||0),
      details
    });
  },
  setPeriodStatus(id,status) { return BackendApi.request(`/payroll/periods/${encodeURIComponent(id)}/status`,{method:'PATCH',body:{status}}).then(mapPeriod); },
  removeReceipt(id) { return BackendApi.delete(`/payroll/receipts/${encodeURIComponent(id)}`); }
};
