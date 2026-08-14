export const legacySpanish = Object.freeze({
  records:'Registros', exports:'Exportaciones', catalog:'Catálogo', taxPresets:'Configuración fiscal', taxAudit:'Auditoría tributaria', officialSources:'Fuentes oficiales', regulatoryUpdates:'Actualizaciones',
  moduleMaturity:'Módulos disponibles', pretesting:'Estado del sistema', pretestingEyebrow:'Control técnico', pretestingTitle:'Estado, seguridad e integraciones', pretestingDesc:'Revisa rutas, integraciones, riesgos y disponibilidad técnica del sistema.',
  businessRules:'Reglas de negocio', licenses:'Licencias', dataImport:'Carga masiva', kardex:'Kardex', accountingStandards:'Normativa contable', daysOfUse:'Días de uso',
  moduleMaturityEyebrow:'Módulos', moduleMaturityTitle:'Disponibilidad de módulos', moduleMaturityDesc:'Clasifica las capacidades operativas, especializadas y opcionales disponibles para cada configuración.',
  businessRulesEyebrow:'Gobernanza', businessRulesTitle:'Reglas de negocio', businessRulesDesc:'Define inventario, facturación, cancelación, cierres, nómina y reversos.',
  licensesEyebrow:'Comercial', licensesTitle:'Licencias y membresías', licensesDesc:'Gestiona licencias por usuario, módulos, plan y vigencia.',
  dataImportEyebrow:'Operaciones', dataImportTitle:'Carga masiva de datos', dataImportDesc:'Importa inventario, clientes, proveedores, cuentas o nómina desde archivos compatibles.',
  standardsEyebrow:'Actualidad contable', standardsTitle:'NIIF, FCCPV y lineamientos', standardsDesc:'Fuentes contables, taxonomía IFRS/XBRL y actualizaciones profesionales.',
  ordersEyebrow:'Pedidos', ordersTitle:'Seguimiento de pedidos', ordersDesc:'Control operativo para caja, preparación, despacho y entrega.',
  posEyebrow:'Ventas rápidas', posTitle:'POS de atención', posDesc:'Registra productos y genera pedidos para mostrador, mesa, retiro o entrega.',
  trackingEyebrow:'Experiencia cliente', trackingTitle:'Seguimiento de pedidos', trackingDesc:'Línea de tiempo desde la recepción hasta la entrega.',
  deliveryEyebrow:'Despacho', deliveryTitle:'Direcciones y mapas', deliveryDesc:'Direcciones, mapas y rutas para entregas.',
  aiEyebrow:'Automatización', aiTitle:'Asistente IA operativo', aiDesc:'Asistente para riesgos, pedidos, inventario, soporte y próximos pasos.',
  demoEyebrow:'Comercial', demoTitle:'Accesos comerciales temporales', demoDesc:'Configura módulos, vigencia, usuarios y límites para accesos comerciales.',
  qrManager:'Gestor QR',
  mobileEyebrow:'Móvil', mobileTitle:'Vista móvil de inventario y ventas', mobileDesc:'Experiencia compacta para operación desde teléfonos y PWA.',
  salesBookEyebrow:'Fiscal', salesBookTitle:'Libro de ventas SENIAT', salesBookDesc:'Reporte mensual de ventas, IVA, IGTF, retenciones y documentos anulados.',
  brandEyebrow:'Marca', brandTitle:'Manual de marca', brandDesc:'Identidad visual, tokens, logo, tipografía, iconografía y uso de marca.',
  adminEyebrow:'Administración', adminTitle:'Panel administrativo', adminDesc:'Usuarios, seguridad, RBAC, suscripciones, empresa y configuración.',
  qrEyebrow:'Automatización', qrTitle:'QR y código de barras', qrDesc:'Etiquetas, lectura, validación y conexión con inventario.',
  profileEyebrow:'Cuenta', profileTitle:'Perfil del usuario', profileDesc:'Datos del usuario, rol, plan y sucursal.',
  hrDashboard:'Recursos humanos', backend:'Integraciones', brandGuidelines:'Manual de marca', adminPanel:'Panel administrativo', stitchViews:'Galería de módulos', demoControl:'Accesos comerciales',
  noResults:'Sin resultados', create:'Crear', update:'Actualizar', view:'Ver', open:'Abrir', send:'Enviar', back:'Volver', next:'Siguiente', previous:'Anterior',
  taxable:'Gravable', exempt:'Exento', quantity:'Cantidad', unitPrice:'Precio unitario', subtotal:'Subtotal', total:'Total', notes:'Notas',
  companyName:'Razón social', tradeName:'Nombre comercial', fiscalAddress:'Dirección fiscal', user:'Usuario', password:'Contraseña', remember:'Recordarme'
});

const sharedEs={
  areaHome:'Inicio',areaSales:'Ventas',areaOperations:'Operaciones',areaInventory:'Inventario',areaPurchases:'Compras',areaAccounting:'Contabilidad',areaTax:'Fiscal',areaHr:'RRHH',areaHealth:'Salud',areaFitness:'Fitness',areaCommunication:'Comunicación',areaAnalytics:'Analítica',areaAdministration:'Administración',areaSupport:'Soporte',
  currentNetTotal:'Total neto actual',taxableBase:'Base imponible',taxSum:'Tributos',retentions:'Retenciones',refreshBcv:'BCV',
  purchasesEyebrow:'Compras',purchasesTitle:'Compras y facturas de proveedor',purchasesDesc:'Registra compras, IVA crédito, borradores y anulaciones con trazabilidad contable.',
  bankingEyebrow:'Tesorería',bankingTitle:'Bancos y conciliación',bankingDesc:'Cuentas, movimientos, extractos y conciliación con trazabilidad.',
  payrollEyebrow:'RRHH y nómina',payrollTitle:'Nómina por períodos',payrollDesc:'Empleados, incidencias, recibos, aprobación, pago y auditoría.',
  kardexEyebrow:'Inventario',kardexTitle:'Kardex y costo promedio',kardexDesc:'Entradas, salidas, saldo, costo promedio y valoración del producto.'
};
const sharedEn={
  areaHome:'Home',areaSales:'Sales',areaOperations:'Operations',areaInventory:'Inventory',areaPurchases:'Purchasing',areaAccounting:'Accounting',areaTax:'Tax',areaHr:'HR',areaHealth:'Health',areaFitness:'Fitness',areaCommunication:'Communication',areaAnalytics:'Analytics',areaAdministration:'Administration',areaSupport:'Support',
  currentNetTotal:'Current net total',taxableBase:'Taxable base',taxSum:'Taxes',retentions:'Withholdings',refreshBcv:'BCV',
  purchasesEyebrow:'Purchasing',purchasesTitle:'Purchases and supplier invoices',purchasesDesc:'Record purchases, input VAT, drafts and reversals with accounting traceability.',
  bankingEyebrow:'Treasury',bankingTitle:'Banking and reconciliation',bankingDesc:'Accounts, transactions, statements and reconciliation with traceability.',
  payrollEyebrow:'HR and payroll',payrollTitle:'Payroll by period',payrollDesc:'Employees, payroll events, receipts, approval, payment and audit.',
  kardexEyebrow:'Inventory',kardexTitle:'Kardex and average cost',kardexDesc:'Incoming, outgoing, balance, average cost and product valuation.'
};
const sharedZh={
  areaHome:'首页',areaSales:'销售',areaOperations:'运营',areaInventory:'库存',areaPurchases:'采购',areaAccounting:'会计',areaTax:'税务',areaHr:'人力资源',areaHealth:'医疗',areaFitness:'健身',areaCommunication:'沟通',areaAnalytics:'分析',areaAdministration:'管理',areaSupport:'支持',
  currentNetTotal:'当前净额',taxableBase:'计税基础',taxSum:'税费',retentions:'代扣款',refreshBcv:'BCV',
  purchasesEyebrow:'采购',purchasesTitle:'采购与供应商发票',purchasesDesc:'记录采购、进项税、草稿与冲销，并保留会计追踪。',
  bankingEyebrow:'资金管理',bankingTitle:'银行与对账',bankingDesc:'管理账户、交易、对账单和可追踪的银行对账。',
  payrollEyebrow:'人力资源与薪资',payrollTitle:'期间薪资',payrollDesc:'员工、薪资事项、工资单、审批、支付和审计。',
  kardexEyebrow:'库存',kardexTitle:'库存明细与平均成本',kardexDesc:'入库、出库、余额、平均成本和产品估值。'
};
const sharedHi={
  areaHome:'होम',areaSales:'बिक्री',areaOperations:'संचालन',areaInventory:'इन्वेंटरी',areaPurchases:'खरीद',areaAccounting:'लेखांकन',areaTax:'कर',areaHr:'एचआर',areaHealth:'स्वास्थ्य',areaFitness:'फिटनेस',areaCommunication:'संचार',areaAnalytics:'विश्लेषण',areaAdministration:'प्रशासन',areaSupport:'सहायता',
  currentNetTotal:'वर्तमान शुद्ध कुल',taxableBase:'कर योग्य आधार',taxSum:'कर',retentions:'कटौतियाँ',refreshBcv:'BCV',
  purchasesEyebrow:'खरीद',purchasesTitle:'खरीद और आपूर्तिकर्ता चालान',purchasesDesc:'खरीद, इनपुट VAT, ड्राफ्ट और रिवर्सल को लेखांकन ट्रेस के साथ दर्ज करें।',
  bankingEyebrow:'ट्रेज़री',bankingTitle:'बैंकिंग और मिलान',bankingDesc:'खाते, लेनदेन, स्टेटमेंट और ट्रेस योग्य बैंक मिलान।',
  payrollEyebrow:'एचआर और पेरोल',payrollTitle:'अवधि अनुसार पेरोल',payrollDesc:'कर्मचारी, पेरोल घटनाएँ, रसीदें, अनुमोदन, भुगतान और ऑडिट।',
  kardexEyebrow:'इन्वेंटरी',kardexTitle:'कार्डेक्स और औसत लागत',kardexDesc:'आवक, जावक, शेष, औसत लागत और उत्पाद मूल्यांकन।'
};
const sharedAr={
  areaHome:'الرئيسية',areaSales:'المبيعات',areaOperations:'العمليات',areaInventory:'المخزون',areaPurchases:'المشتريات',areaAccounting:'المحاسبة',areaTax:'الضرائب',areaHr:'الموارد البشرية',areaHealth:'الصحة',areaFitness:'اللياقة',areaCommunication:'التواصل',areaAnalytics:'التحليلات',areaAdministration:'الإدارة',areaSupport:'الدعم',
  currentNetTotal:'صافي الإجمالي الحالي',taxableBase:'الوعاء الضريبي',taxSum:'الضرائب',retentions:'الاستقطاعات',refreshBcv:'BCV',
  purchasesEyebrow:'المشتريات',purchasesTitle:'المشتريات وفواتير الموردين',purchasesDesc:'تسجيل المشتريات وضريبة المدخلات والمسودات والإلغاءات مع تتبع محاسبي.',
  bankingEyebrow:'الخزينة',bankingTitle:'البنوك والمطابقة',bankingDesc:'الحسابات والحركات والكشوف والمطابقة البنكية مع قابلية التتبع.',
  payrollEyebrow:'الموارد البشرية والرواتب',payrollTitle:'الرواتب حسب الفترة',payrollDesc:'الموظفون وأحداث الرواتب والإيصالات والموافقة والدفع والتدقيق.',
  kardexEyebrow:'المخزون',kardexTitle:'حركة المخزون ومتوسط التكلفة',kardexDesc:'الوارد والصادر والرصيد ومتوسط التكلفة وتقييم المنتج.'
};

export const sharedTranslations=Object.freeze({es:Object.freeze(sharedEs),en:Object.freeze(sharedEn),zh:Object.freeze(sharedZh),hi:Object.freeze(sharedHi),ar:Object.freeze(sharedAr)});
