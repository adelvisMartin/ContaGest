import { Badge, Button, DataTable, PageHeader, Section } from '../components/ui/index.js';
import { downloadText } from '../utils/dom.js';

const paletteRows = [
  { token:'--cg-v-bg', light:'#F4F5F7', dark:'#111214', use:'Canvas global' },
  { token:'--cg-v-surface', light:'#FFFFFF', dark:'#181A1D', use:'Paneles y tarjetas' },
  { token:'--cg-v-surface-2', light:'#F8F9FB', dark:'#1F2125', use:'Hover y superficies secundarias' },
  { token:'--cg-v-text', light:'#17191D', dark:'#F4F5F7', use:'Texto principal' },
  { token:'--cg-v-text-muted', light:'#626874', dark:'#A4A9B2', use:'Texto secundario' },
  { token:'--cg-v-border', light:'#E1E4E9', dark:'#2B2E34', use:'Divisores y bordes' },
  { token:'--cg-v-brand', light:'#5661E8', dark:'#7C86FF', use:'Acción y estado activo' }
];

const typeRows = [
  { role:'Título de página', size:'20–24 px', weight:'700', use:'Una vez por vista' },
  { role:'Título de sección', size:'15–17 px', weight:'600–700', use:'Bloques funcionales' },
  { role:'Texto operativo', size:'12–13 px', weight:'400–500', use:'Contenido y formularios' },
  { role:'KPI / importe', size:'16–20 px', weight:'700', use:'Tabular, una línea, nunca ellipsis' },
  { role:'Label / tabla', size:'9–11 px', weight:'600', use:'Metadatos y encabezados' }
];

export const BrandGuidelinesPage = {
  render() {
    return `<section class="cgx-page cg-brand-guide-v15">
      ${PageHeader({
        eyebrow:'Sistema visual',
        title:'Guía de interfaz ContaGest v15',
        description:'Contrato visual operativo para que los módulos compartan la misma jerarquía, densidad, navegación y comportamiento Light/Dark.',
        actions:`${Button({id:'btnBrandAssets',text:'Exportar tokens',icon:'fa-download',variant:'secondary'})}${Button({id:'btnTechDoc',text:'Arquitectura',icon:'fa-code',variant:'secondary'})}${Button({id:'btnBrandGuide',text:'Claims y marca',icon:'fa-file-lines'})}`,
        meta:['Light/Dark misma geometría','Inter + Font Awesome','Sin gradients / glass / blobs']
      })}
      ${Section({
        title:'Principios no negociables',
        subtitle:'ContaGest es una herramienta ERP de productividad; el sitio comercial público tiene una superficie separada.',
        children:`<div class="cgx-action-list"><div>${Badge('Densidad','brand')} <strong>Información primero</strong><p>Shell compacto, controles de 38 px y tarjetas que priorizan lectura rápida.</p></div><div>${Badge('Jerarquía','success')} <strong>Una escala tipográfica</strong><p>Los títulos, KPI, labels y tablas conservan la misma escala en todos los dominios.</p></div><div>${Badge('Theming','brand')} <strong>Light y Dark equivalentes</strong><p>El tema cambia color y contraste, nunca la geometría ni la ubicación de acciones.</p></div><div>${Badge('Datos','warning')} <strong>Números completos</strong><p>Moneda, RIF, documentos y valores financieros usan números tabulares y no se recortan.</p></div></div>`
      })}
      ${Section({
        title:'Paleta semántica canónica',
        subtitle:'Los módulos consumen estos tokens; no deben crear paletas independientes.',
        children:DataTable({columns:[{key:'token',label:'Token'},{key:'light',label:'Light'},{key:'dark',label:'Dark'},{key:'use',label:'Uso'}],rows:paletteRows})
      })}
      ${Section({
        title:'Escala tipográfica',
        subtitle:'La jerarquía es compacta y consistente con una aplicación de trabajo intensivo.',
        children:DataTable({columns:[{key:'role',label:'Rol'},{key:'size',label:'Tamaño'},{key:'weight',label:'Peso'},{key:'use',label:'Regla'}],rows:typeRows})
      })}
      ${Section({
        title:'Navegación y superficies',
        subtitle:'Patrones compartidos en todo el ERP.',
        children:`<div class="cgx-action-list"><div><strong>Sidebar</strong><p>244 px abierto / 68 px rail. Accesos principales primero; sólo el grupo activo se expande. Perfil y utilidades abajo.</p></div><div><strong>Topbar</strong><p>Contexto de ruta, búsqueda global, nueva operación, BCV, tema y usuario. Sin una segunda barra de navegación.</p></div><div><strong>Cards</strong><p>Superficie neutral, borde de 1 px, radio 10–12 px y sombra mínima. No se usan círculos decorativos.</p></div><div><strong>Estados activos</strong><p>Superficie sutil + indicador de marca. Evitar grandes bloques azules saturados salvo CTA primaria.</p></div></div>`
      })}
      ${Section({
        title:'Iconografía y motion',
        subtitle:'Consistencia antes que variedad.',
        children:`<div class="cgx-action-list"><div><strong>Font Awesome</strong><p>Es la familia canónica del shell y de las vistas vanilla. MUI mantiene iconos compatibles sin crear otra identidad.</p></div><div><strong>Motion funcional</strong><p>120–170 ms para hover, selección, apertura y feedback. Se respeta <code>prefers-reduced-motion</code>.</p></div><div><strong>Accesibilidad</strong><p>Foco visible, contraste verificable, controles táctiles y labels asociados a inputs.</p></div><div><strong>Responsive</strong><p>360 / 390 / 430 / 768 / 1024 / 1440. Sólo tablas, tabs, kanban o calendarios pueden poseer scroll horizontal.</p></div></div>`
      })}
      ${Section({
        title:'Assets canónicos v11.15',
        subtitle:'La aplicación y el sitio público reutilizan una sola identidad. No crear logos o iconos alternativos por módulo.',
        children:`<div class="cgx-action-list"><div><strong>Icono de aplicación</strong><p><img src="/icons/contagest-app.svg" alt="Icono canónico de ContaGest" width="88" height="88" loading="lazy"></p><code>/icons/contagest-app.svg</code></div><div><strong>Logotipo principal</strong><p><img src="/brand/contagest-logo.svg" alt="Logotipo canónico de ContaGest" width="280" height="72" loading="lazy"></p><code>/brand/contagest-logo.svg</code></div></div>`
      })}
      ${Section({
        title:'Marca, SEO y claims',
        subtitle:'La comunicación pública debe reflejar el producto comprobable y mantener la aplicación privada fuera del índice.',
        children:`<div class="cgx-action-list"><div>${Badge('Disponible','success')} <strong>Capacidades verificadas</strong><p>ERP modular, ventas, inventario, contabilidad, bancos, reportes, PWA, roles, permisos y licencias según módulos habilitados.</p></div><div>${Badge('Condicional','warning')} <strong>Proveedor/configuración requerida</strong><p>IA, WhatsApp/SMS/email, automatización BCV y backup externo sólo se publican como activos cuando el ambiente correspondiente está configurado y verificado.</p></div><div>${Badge('Planificado','brand')} <strong>Integraciones no verificadas</strong><p>Validación SENIAT o conciliación bancaria universal en tiempo real deben etiquetarse como planificadas hasta existir integración productiva probada.</p></div><div>${Badge('Prohibido','danger')} <strong>Garantías absolutas</strong><p>No usar “inhackeable”, “100% seguro”, “seguridad blindada”, “cifrado de extremo a extremo” para toda la app ni certificaciones sin evidencia.</p></div><div><strong>Separación SEO</strong><p>La aplicación privada vive en <code>/</code> con rutas <code>?module=…</code> y usa <code>noindex</code>. El sitio comercial indexable vive en <code>/soluciones/</code> y sus verticales.</p></div><div><strong>Fuentes de verdad</strong><p>Claims: <code>docs/MARKETING_CLAIMS_REGISTER.md</code>. Precios: <code>docs/COMMERCIAL_PRICING_V1.md</code>.</p></div></div>`
      })}
    </section>`;
  },
  mount(_state,{Toast}) {
    const content = [
      'ContaGest Visual System v15',
      'Light BG: #F4F5F7',
      'Light surface: #FFFFFF',
      'Dark BG: #111214',
      'Dark surface: #181A1D',
      'Light brand: #5661E8',
      'Dark brand: #7C86FF',
      'Page title: 20–24 px',
      'KPI: 16–20 px',
      'Control: 38 px',
      'Sidebar: 244 px / 68 px rail',
      'App icon: /icons/contagest-app.svg',
      'Brand logo: /brand/contagest-logo.svg',
      'Marketing public: /soluciones/',
      'Aplicación privada: / + ?module=… + noindex',
      'Source: frontend/src/styles/contagest-visual-system-v12.css',
      'Claims: docs/MARKETING_CLAIMS_REGISTER.md',
      'Pricing: docs/COMMERCIAL_PRICING_V1.md'
    ].join('\n');
    document.getElementById('btnBrandAssets')?.addEventListener('click',()=>{downloadText('contagest-visual-system-v15.txt',content);Toast.show('Tokens y assets v15 exportados.','success');});
    document.getElementById('btnTechDoc')?.addEventListener('click',()=>Toast.show('Arquitectura: docs/ARCHITECTURE.md y docs/design-system/.','info'));
    document.getElementById('btnBrandGuide')?.addEventListener('click',()=>Toast.show('Guías: docs/BRAND_GUIDELINES.md, docs/MARKETING_CLAIMS_REGISTER.md y docs/MARKETING_SEO_V1.md.','info'));
  }
};
