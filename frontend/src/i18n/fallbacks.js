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
  psychology:'Psicología', psychologyEyebrow:'Consulta privada', psychologyTitle:'Psicología, pacientes y agenda', psychologyDesc:'Gestiona pacientes, citas, planificación semanal y confirmaciones desde un espacio privado y enfocado.',
  appointments:'Citas', patients:'Pacientes', thisWeek:'Esta semana', pendingConfirmation:'Por confirmar', calendar:'Calendario', reminder:'Recordatorio', reminders:'Recordatorios',
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
  kardexEyebrow:'Inventario',kardexTitle:'Kardex y costo promedio',kardexDesc:'Entradas, salidas, saldo, costo promedio y valoración del producto.',
  psychology:'Psicología',psychologyEyebrow:'Consulta privada',psychologyTitle:'Psicología, pacientes y agenda',psychologyDesc:'Gestiona pacientes, citas, planificación semanal y confirmaciones desde un espacio privado y enfocado.',
  patients:'Pacientes',appointments:'Citas',thisWeek:'Esta semana',pendingConfirmation:'Por confirmar',calendar:'Calendario',reminders:'Recordatorios'
};
const sharedEn={
  areaHome:'Home',areaSales:'Sales',areaOperations:'Operations',areaInventory:'Inventory',areaPurchases:'Purchasing',areaAccounting:'Accounting',areaTax:'Tax',areaHr:'HR',areaHealth:'Health',areaFitness:'Fitness',areaCommunication:'Communication',areaAnalytics:'Analytics',areaAdministration:'Administration',areaSupport:'Support',
  currentNetTotal:'Current net total',taxableBase:'Taxable base',taxSum:'Taxes',retentions:'Withholdings',refreshBcv:'BCV',
  purchasesEyebrow:'Purchasing',purchasesTitle:'Purchases and supplier invoices',purchasesDesc:'Record purchases, input VAT, drafts and reversals with accounting traceability.',
  bankingEyebrow:'Treasury',bankingTitle:'Banking and reconciliation',bankingDesc:'Accounts, transactions, statements and reconciliation with traceability.',
  payrollEyebrow:'HR and payroll',payrollTitle:'Payroll by period',payrollDesc:'Employees, payroll events, receipts, approval, payment and audit.',
  kardexEyebrow:'Inventory',kardexTitle:'Kardex and average cost',kardexDesc:'Incoming, outgoing, balance, average cost and product valuation.',
  psychology:'Psychology',psychologyEyebrow:'Private practice',psychologyTitle:'Psychology, clients and scheduling',psychologyDesc:'Manage clients, appointments, weekly planning and confirmations in a focused private-practice workspace.',
  patients:'Clients',appointments:'Appointments',thisWeek:'This week',pendingConfirmation:'Awaiting confirmation',calendar:'Calendar',reminders:'Reminders'
};
const sharedPt={
  areaHome:'Início',areaSales:'Vendas',areaOperations:'Operações',areaInventory:'Estoque',areaPurchases:'Compras',areaAccounting:'Contabilidade',areaTax:'Fiscal',areaHr:'RH',areaHealth:'Saúde',areaFitness:'Fitness',areaCommunication:'Comunicação',areaAnalytics:'Análises',areaAdministration:'Administração',areaSupport:'Suporte',
  appTitle:'ERP empresarial',dashboard:'Painel',sales:'Vendas',quote:'Orçamentos',clients:'Clientes',history:'Histórico',inventory:'Estoque',taxes:'Tributos',reports:'Relatórios',ledger:'Contabilidade',banking:'Bancos',payroll:'Folha de pagamento',suppliers:'Fornecedores',purchases:'Compras',audit:'Auditoria',analytics:'Análises',tasks:'Tarefas',profile:'Perfil',settings:'Configurações',help:'Ajuda',support:'Suporte',language:'Idioma',theme:'Tema',reportsCurrency:'Moeda dos relatórios',logout:'Sair',changePhoto:'Alterar foto',
  currentNetTotal:'Total líquido atual',taxableBase:'Base tributável',taxSum:'Tributos',retentions:'Retenções',refreshBcv:'BCV',
  save:'Salvar',add:'Adicionar',edit:'Editar',delete:'Excluir',clear:'Limpar',search:'Buscar',refresh:'Atualizar',sync:'Sincronizar',print:'Imprimir',download:'Baixar',close:'Fechar',cancel:'Cancelar',confirm:'Confirmar',newRecord:'Novo',noData:'Sem dados',
  name:'Nome',email:'E-mail',phone:'Telefone',type:'Tipo',address:'Endereço',actions:'Ações',client:'Cliente',date:'Data',amount:'Valor',currency:'Moeda',product:'Produto',qty:'Quantidade',price:'Preço',category:'Categoria',cost:'Custo',margin:'Margem',stock:'Estoque',account:'Conta',description:'Descrição',employee:'Colaborador',salary:'Salário',supplier:'Fornecedor',reference:'Referência',bank:'Banco',status:'Status',title:'Título',module:'Módulo',priority:'Prioridade',role:'Função',plan:'Plano',source:'Fonte',
  synced:'Sincronizado',pendingSync:'Pendente de sincronização',active:'Ativo',inactive:'Inativo',pending:'Pendente',completed:'Concluído',cancelled:'Cancelado',all:'Todos',today:'Hoje',yes:'Sim',no:'Não',light:'Claro',dark:'Escuro',company:'Empresa',appearance:'Aparência',integrations:'Integrações',backup:'Backup',security:'Segurança',privacy:'Privacidade',
  purchasesEyebrow:'Compras',purchasesTitle:'Compras e notas de fornecedores',purchasesDesc:'Registre compras, crédito fiscal, rascunhos e estornos com rastreabilidade contábil.',
  bankingEyebrow:'Tesouraria',bankingTitle:'Bancos e conciliação',bankingDesc:'Contas, movimentações, extratos e conciliação com rastreabilidade.',
  payrollEyebrow:'RH e folha',payrollTitle:'Folha por período',payrollDesc:'Colaboradores, eventos, recibos, aprovação, pagamento e auditoria.',
  kardexEyebrow:'Estoque',kardexTitle:'Kardex e custo médio',kardexDesc:'Entradas, saídas, saldo, custo médio e valorização do produto.',
  psychology:'Psicologia',psychologyEyebrow:'Consultório particular',psychologyTitle:'Psicologia, pacientes e agenda',psychologyDesc:'Gerencie pacientes, consultas, planejamento semanal e confirmações em um espaço focado para consultório particular.',
  patients:'Pacientes',appointments:'Consultas',thisWeek:'Esta semana',pendingConfirmation:'Aguardando confirmação',calendar:'Calendário',reminders:'Lembretes',
  unifiedManagement:'Gestão empresarial unificada'
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

export const sharedTranslations=Object.freeze({
  es:Object.freeze(sharedEs),en:Object.freeze(sharedEn),pt:Object.freeze(sharedPt),zh:Object.freeze(sharedZh),hi:Object.freeze(sharedHi),ar:Object.freeze(sharedAr)
});

export const routeFallbackTranslations=Object.freeze({
  es:Object.freeze({psicologia:'Psicología y agenda'}),
  en:Object.freeze({psicologia:'Psychology & scheduling'}),
  pt:Object.freeze({
    dashboard:'Painel',mobile:'Visão móvel',ventas:'Vendas',cotizacion:'Orçamentos',clientes:'Clientes',historial:'Histórico',pedidos:'Pedidos','pos-sede':'PDV','tracking-pedidos':'Acompanhamento de pedidos','delivery-mapa':'Mapa de entregas',tasks:'Tarefas',inventario:'Estoque','inventario-scan':'Scanner de estoque',kardex:'Kardex',qr:'QR / Código de barras',proveedores:'Fornecedores',compras:'Compras',contabilidad:'Livro diário','plan-cuentas':'Plano de contas','libro-mayor':'Razão geral','balance-sumas-saldos':'Balancete','hoja-trabajo':'Planilha de trabalho','estados-financieros':'Demonstrações financeiras','cierre-contable':'Fechamento contábil',bancos:'Bancos','normativa-contable':'Normas contábeis',tributos:'Tributos','libro-ventas':'Livro de vendas',normativa:'Normas',nomina:'Folha de pagamento',rrhh:'Recursos humanos',salud:'Clínica',veterinaria:'Clínica veterinária',psicologia:'Psicologia e agenda',gimnasio:'Academia',rutinas:'Treinos',nutricion:'Nutrição',mensajes:'Mensagens',analytics:'Análises',reportes:'Relatórios',auditoria:'Auditoria',configuracion:'Configurações',backend:'Integrações',admin:'Administração',marca:'Marca','demo-control':'Acessos comerciais',licencias:'Licenças','importacion-data':'Importação em massa',pretesting:'Status do sistema',ayuda:'Ajuda',soporte:'Suporte','asistente-ia':'Assistente IA',vistas:'Galeria de módulos'
  }),
  zh:Object.freeze({psicologia:'心理咨询与预约'}),
  hi:Object.freeze({psicologia:'मनोविज्ञान और अपॉइंटमेंट'}),
  ar:Object.freeze({psicologia:'علم النفس والمواعيد'})
});
