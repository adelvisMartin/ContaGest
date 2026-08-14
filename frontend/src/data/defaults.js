import { today, uid } from '../utils/dom.js';
import { AccessControlService } from '../services/accessControlService.js';
import { FailureLogService } from '../services/failureLogService.js';

export function createDefaultState() {
  return {
    version: 'v11.18.0-phase3-shell-psychology',
    route: 'dashboard',
    settings: {
      theme: 'light', businessMode: 'admin', lang: 'es', reportCurrency: 'dual', sidebarCollapsed: false,
      supportWidget: 'peek', density: 'compact', backendUrl: 'http://localhost:3030', sheetsUrl: '', googleCalendarId: 'primary',
      appointmentEmailFrom: '', whatsappBusinessNumber: '', appointmentReminderHours: 24,
      companyName: 'ContaGest-VE', companyTradeName: 'ContaGest Comercial', companyRif: 'J123456789', companyAddress: 'Caracas, Venezuela · Sucursal Central',
      companyPhone: '+58 412-0000000', companyEmail: 'administracion@contagest.ve', companyWebsite: 'www.contagest.ve', companySlogan: 'Gestión empresarial, contable y operativa', companyLogoDataUrl: '',
      documentFooter: 'Documento sujeto a validación normativa, correlativo fiscal, revisión contable y auditoría interna.',
      documentLegalNote: 'Este comprobante debe validarse contra los libros fiscales y las normas tributarias vigentes antes de su emisión definitiva.', brandPrimary: '#00236f', brandSurface: '#f7f9fb'
    },
    bcv: { rate: 0, source: 'Pendiente', updatedAt: null },
    quote: { date: today(), numeroFactura: `FAC-${new Date().getFullYear()}-001`, orden: `ORD-${new Date().getFullYear()}-001`, clientId: '', currency: 'USD', manualAmount: 0, observation: '', items: [], taxes: { iva: { active: true, rate: 16 }, igtf: { active: false, rate: 3 }, islr: { active: false, rate: 2 }, custom: { active: false, rate: 0, label: 'Otro tributo' }, retIva: { active: false, rate: 75 }, retIslr: { active: false, rate: 2 } } },
    calculation: {},
    clients: [
      { id: uid('cli'), name: 'Distribuidora Metropolitana C.A.', rif: 'J123456789', email: 'compras@distribuidorametropolitana.com', phone: '+58 412-0000000', type: 'Contribuyente ordinario', address: 'Av. Principal, Caracas' },
      { id: uid('cli'), name: 'Servicios Andinos 2026', rif: 'J987654321', email: 'administracion@andinos.com', phone: '+58 424-0000000', type: 'Especial', address: 'Valencia, Carabobo' }
    ],
    inventory: [
      { id: uid('prd'), sku: 'CG-CBL-012', barcode: '7591000000123', qrCode: 'CGVE:PRD:CG-CBL-012', name: 'Cable THHN 12 AWG', category: 'Servicios', stock: 2, reserved: 0, min: 8, costUsd: 12, priceUsd: 24 },
      { id: uid('prd'), sku: 'CG-LED-009', barcode: '7591000000093', qrCode: 'CGVE:PRD:CG-LED-009', name: 'Bombillos LED 9W', category: 'Inventario', stock: 15, reserved: 3, min: 20, costUsd: 3.4, priceUsd: 7.9 },
      { id: uid('prd'), sku: 'CG-TAB-012', barcode: '7591000001205', qrCode: 'CGVE:PRD:CG-TAB-012', name: 'Tablero 12 Circuitos', category: 'Servicios', stock: 48, reserved: 4, min: 10, costUsd: 28, priceUsd: 55 }
    ],
    history: [], customAccounts: [], licenses: [], importPreview: [], importType: 'inventory', regulatoryFeeds: [], ifrsTaxonomy: [], inventoryMovements: [],
    ledger: { accounts: ['Caja', 'Bancos', 'Cuentas por cobrar', 'Inventario', 'IVA crédito fiscal', 'IVA débito fiscal', 'Ventas', 'Compras', 'Gastos administrativos', 'Retenciones por pagar'], entries: [] },
    accounting: { adjustments: [], periods: [], closePolicy: { requireBalancedTrialBalance: true, requireLockedTaxes: true, requireBankReconciliation: false } },
    banking: { accounts: [{ id: uid('bank'), bank: 'Banesco', account: '0102-****-0001', currency: 'VES', balance: 0 }, { id: uid('bank'), bank: 'Mercantil', account: '0105-****-0002', currency: 'USD', balance: 0 }], movements: [] },
    payroll: { records: [] }, psychology: { patients: [], appointments: [], reminders: [], loadedAt: null },
    suppliers: [{ id: uid('sup'), name: 'Suministros Centro C.A.', rif: 'J111111111', email: 'facturacion@suministroscentro.com', phone: '+58 414-1111111', category: 'Insumos' }],
    purchases: [], inventoryScans: [],
    sales: [
      { id: uid('sale'), date: today(), client: 'Constructora El Ávila', invoice: 'FAC-2026-001', amount: 450200, status: 'Cobrada', method: 'Transferencia' },
      { id: uid('sale'), date: today(), client: 'Industrias Coral', invoice: 'FAC-2026-002', amount: 98500, status: 'Pendiente', method: 'Crédito' }
    ],
    tasks: [
      { id: uid('task'), title: 'Declarar IVA mensual', module: 'Tributos', due: today(), priority: 'Alta', status: 'Pendiente' },
      { id: uid('task'), title: 'Reabastecer Cable THHN 12 AWG', module: 'Inventario', due: today(), priority: 'Crítica', status: 'Pendiente' },
      { id: uid('task'), title: 'Conciliar Banco Mercantil', module: 'Bancos', due: today(), priority: 'Media', status: 'En proceso' }
    ],
    profile: { name: 'Administrador', email: 'admin@empresa.com', role: 'Administrador', branch: 'Sucursal Central', plan: 'Enterprise', avatarDataUrl: '' },
    admin: { activeUsers: 0, apiRequests24h: 0, storagePct: 0, licensesUsed: 0, licensesTotal: 0, billingCutoff: null },
    brand: { name: 'ContaGest-VE', primary: '#00236f', container: '#1e3a8a', surface: '#f7f9fb', dark: '#0f172a' },
    regulatory: { query: 'iva', sources: [{ name: 'SENIAT', kind: 'Tributario', url: 'https://seniat.gob.ve', status: 'Referencial' }, { name: 'Gaceta Oficial', kind: 'Normativa', url: 'https://www.gacetaoficial.gob.ve', status: 'Validación manual' }, { name: 'BCV', kind: 'Tasa oficial', url: 'https://www.bcv.org.ve', status: 'Consulta diaria' }], updates: [] },
    auditLog: [], failureLog: FailureLogService.defaultState(), moduleRuntime: {}, security: { rls: true, rbac: true, auditLog: true, rateLimit: true, corsStrict: true, csrfReady: true },
    analytics: { events: [], visits: {}, sessions: [], lastEventAt: null }, qr: { defaultErrorCorrection: 'M', labelSize: '70x40mm', verifyBaseUrl: '/verify' },
    fastFoodMenu: [
      { sku: 'COMBO-01', name: 'Combo burger clásica', category: 'Combos', price: 9.90, icon: 'fa-burger', barcode: '7593001000011' },
      { sku: 'COMBO-02', name: 'Combo crispy chicken', category: 'Combos', price: 10.75, icon: 'fa-drumstick-bite', barcode: '7593001000028' },
      { sku: 'BUR-CLAS', name: 'Burger clásica', category: 'Burgers', price: 7.50, icon: 'fa-burger', barcode: '7593001000035' },
      { sku: 'BUR-DOBLE', name: 'Burger doble queso', category: 'Burgers', price: 8.95, icon: 'fa-burger', barcode: '7593001000042' },
      { sku: 'PAP-MED', name: 'Papas medianas', category: 'Extras', price: 2.50, icon: 'fa-bowl-food', barcode: '7593001000059' },
      { sku: 'NUG-06', name: 'Nuggets x6', category: 'Extras', price: 3.80, icon: 'fa-bowl-rice', barcode: '7593001000066' },
      { sku: 'REF-355', name: 'Refresco 355ml', category: 'Bebidas', price: 1.80, icon: 'fa-bottle-water', barcode: '7593001000073' },
      { sku: 'AGUA-500', name: 'Agua 500ml', category: 'Bebidas', price: 1.20, icon: 'fa-bottle-water', barcode: '7593001000080' }
    ],
    posCart: [], foodOrders: [], demoAccess: [], aiAssistant: { messages: [] }, support: { whatsapp: '+584120000000', email: 'soporte@contagest.ve', sla: 'L-V 8:00am a 6:00pm' }, delivery: { origin: 'Sucursal Central, Caracas, Venezuela', provider: 'google_maps', fallbackProvider: 'mapbox' }, rbac: AccessControlService.defaultState()
  };
}
