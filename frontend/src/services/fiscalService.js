import { BackendApi } from './backendApi.js';

export const FISCAL_MODULES=[
  {value:'fiscal',label:'Fiscal general'},
  {value:'iva',label:'IVA'},
  {value:'islr',label:'ISLR'},
  {value:'igtf',label:'IGTF'},
  {value:'retiva',label:'Retención IVA'},
  {value:'municipal',label:'Municipal'}
];

export const FISCAL_DOCUMENT_KINDS=[
  {value:'invoice',label:'Factura'},
  {value:'credit_note',label:'Nota de crédito'},
  {value:'debit_note',label:'Nota de débito'},
  {value:'withholding',label:'Comprobante de retención'},
  {value:'tax_return',label:'Declaración'},
  {value:'supporting_document',label:'Documento soporte'},
  {value:'other',label:'Otro'}
];

export const FiscalService={
  legalSources(){return BackendApi.get('/fiscal/legal-sources');},
  rules(){return BackendApi.get('/fiscal/rules');},
  previewReviewedTaxEvent(data){return BackendApi.post('/fiscal/tax-events/preview',data);},
  reviewLegalSource(id,approved,reason){return BackendApi.post(`/fiscal/legal-sources/${encodeURIComponent(id)}/review`,{approved,reason});},
  reviewRule(id,reason){return BackendApi.post(`/fiscal/rules/${encodeURIComponent(id)}/review`,{reason});},
  activateRule(id,reason){return BackendApi.post(`/fiscal/rules/${encodeURIComponent(id)}/activate`,{reason});},
  taxpayerProfiles(){return BackendApi.get('/fiscal/taxpayer-profiles');},
  captureTaxpayerProfileDraft(data){return BackendApi.post('/fiscal/taxpayer-profiles',data);},
  reviewTaxpayerProfile(id,reason){return BackendApi.post(`/fiscal/taxpayer-profiles/${encodeURIComponent(id)}/review`,{reason});},
  activateTaxpayerProfile(id,reason){return BackendApi.post(`/fiscal/taxpayer-profiles/${encodeURIComponent(id)}/activate`,{reason});},
  periods(){return BackendApi.get('/fiscal/periods');},
  createPeriod(data){return BackendApi.post('/fiscal/periods',data);},
  closePeriod(data){return BackendApi.post('/fiscal/close-period',data);},
  reopenPeriod(data){return BackendApi.post('/fiscal/reopen-period',data);},
  documents(period=''){return BackendApi.get(`/fiscal/documents${period?`?period=${encodeURIComponent(period)}`:''}`);},
  createDocument(data){return BackendApi.post('/fiscal/documents',data);}
};
