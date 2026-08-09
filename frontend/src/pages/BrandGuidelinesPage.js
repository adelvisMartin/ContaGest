import { EnterpriseButton } from '../components/ui/index.js';
import { downloadText } from '../utils/dom.js';

const logoSvg = `<img src="/brand/contagest-logo.svg" alt="ContaGest · ERP empresarial" style="width:min(100%,560px);height:auto"/>`;

const ColorBox = ({ title, subtitle, hex, className = '' }) => `
  <div class="brand-color ${className}">
    <div><p>${title}</p><small>${subtitle}</small></div>
    <div class="brand-color-bottom"><span>${hex}</span><b>${title === 'Azul profundo' ? 'BRAND-DEEP' : 'TOKEN'}</b></div>
  </div>`;

export const BrandGuidelinesPage = {
  render() {
    const content = `
      <section class="hf-brand-guide">
        <header class="hf-brand-header">
          <div><h2>Manual de Marca Resumido</h2><p>Identidad visual, diseño de interfaz y mensajes verificables de ContaGest.</p></div>
          <div class="hf-actions compact">${EnterpriseButton({ id:'btnBrandAssets', text:'Assets', icon:'download', variant:'secondary' })}${EnterpriseButton({ id:'btnTechDoc', text:'Doc. técnica', icon:'api', variant:'secondary' })}${EnterpriseButton({ id:'btnBrandGuide', text:'Claims y guía', icon:'picture_as_pdf', variant:'primary' })}</div>
        </header>
        <div class="brand-stack">
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">fingerprint</span><h3>Identidad y propuesta de valor</h3></div>
            <div class="brand-two-col">
              <div><p class="cgv-label">El nombre</p><h4>ContaGest</h4><p>Une <strong>Contabilidad</strong> y <strong>Gestión</strong>. El producto se orienta al control financiero y operativo modular de empresas y profesionales, con adaptación al contexto venezolano.</p></div>
              <div><p class="cgv-label">Propuesta de valor</p><div class="brand-quote">“Control empresarial modular: ventas, inventario, bancos, contabilidad y reportes, con perfiles multiempresa autorizados y verticales opcionales cuando el negocio los necesita.”</div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">architecture</span><h3>Arquitectura e integraciones</h3></div>
            <div class="brand-two-col">
              <div><p class="cgv-label">Integraciones</p><ul><li><strong>BCV:</strong> soporte de tasa/fuente dentro del producto; la automatización pública solo se anuncia cuando la fuente de producción está activa y monitoreada.</li><li><strong>SENIAT y bancos:</strong> objetivos de integración/conectores. No se publicitan como validación o conciliación universal en tiempo real sin un proveedor/API activo y probado.</li><li><strong>Canales:</strong> email, WhatsApp y SMS se manejan como add-ons opcionales cuando exista proveedor configurado.</li></ul></div>
              <div><p class="cgv-label">Backend y seguridad</p><div class="brand-quote"><p><strong>Aislamiento por empresa:</strong> cada operación se resuelve contra el tenant firmado y permisos del usuario.</p><p><strong>Controles verificables:</strong> RBAC, auditoría, hashing de contraseñas/licencias y, en v11.15 tras QA, sesiones web HttpOnly/CSRF y credenciales de dispositivo emitidas por servidor.</p><p>No se utilizan claims como “inhackeable”, “seguridad blindada” ni “cifrado de extremo a extremo” sin evidencia que los sustente.</p></div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">branding_watermark</span><h3>Logotipo principal</h3></div>
            <div class="logo-grid">
              <div><p class="brand-mini-label">Sobre fondo claro</p><div class="logo-stage logo-stage-light">${logoSvg}</div><div class="brand-links"><button>SVG</button><button>PNG</button></div></div>
              <div><p class="brand-mini-label">Sobre fondo oscuro</p><div class="logo-stage logo-stage-dark"><div class="white-logo-box">${logoSvg}</div></div><div class="brand-links"><button>SVG</button><button>PNG</button></div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">palette</span><h3>Paleta semántica</h3></div>
            <div class="brand-color-grid">${ColorBox({ title:'Azul profundo', subtitle:'Brand / superficies oscuras', hex:'#071A38', className:'primary' })}${ColorBox({ title:'Dark Surface', subtitle:'UI dark', hex:'#0D1B2D', className:'dark' })}</div>
            <div class="token-grid"><div class="token-chip"><b style="background:#215fd1"></b><span>Primary<small>#215FD1</small></span></div><div class="token-chip"><b style="background:#f3f6fb"></b><span>Canvas<small>#F3F6FB</small></span></div><div class="token-chip error"><b style="background:#b42318"></b><span>Error<small>#B42318</small></span></div><div class="token-chip"><b style="background:#d8e1ec"></b><span>Border<small>#D8E1EC</small></span></div></div>
          </section>
          <div class="brand-bottom-grid">
            <section class="brand-card"><div class="brand-card-title"><span class="material-symbols-outlined">text_fields</span><h3>Tipografía: Inter</h3></div><div class="type-row"><span>Display KPI (700)</span><small>48px / 56px</small><strong>Bs. 45.230,00</strong></div><div class="type-row"><span>Headline MD (600)</span><small>24px / 32px</small><strong class="headline">Balance general mensual</strong></div><div class="type-row"><span>Body MD (400)</span><small>16px / 24px</small><p>La jerarquía prioriza legibilidad en tablas, formularios y dashboards densos.</p></div></section>
            <section class="brand-card"><div class="brand-card-title"><span class="material-symbols-outlined">category</span><h3>Iconografía</h3></div><p><strong>Material Symbols Outlined</strong> se utiliza para iconos de interfaz. Las versiones Fill se reservan para estados activos.</p><code>font-variation-settings: 'FILL' 0, 'wght' 400;</code><div class="icon-grid"><div><span class="material-symbols-outlined">analytics</span><small>analytics</small></div><div><span class="material-symbols-outlined">request_quote</span><small>ventas</small></div><div><span class="material-symbols-outlined">account_balance</span><small>contabilidad</small></div><div><span class="material-symbols-outlined">smart_toy</span><small>IA</small></div></div></section>
          </div>
          <footer class="brand-footer">ContaGest · Diseño bajo el sistema Precision Ledger. Claims públicos sujetos a docs/MARKETING_CLAIMS_REGISTER.md.</footer>
        </div>
      </section>`;
    return content;
  },
  mount(_state, { Toast }) {
    const content = `ContaGest Brand Assets\nBrand deep: #071A38\nPrimary: #215FD1\nCanvas: #F3F6FB\nDark surface: #0D1B2D\nClaims: docs/MARKETING_CLAIMS_REGISTER.md`;
    document.getElementById('btnBrandAssets')?.addEventListener('click', () => { downloadText('contagest-brand-assets.txt', content); Toast.show('Assets de marca exportados.', 'success'); });
    document.getElementById('btnTechDoc')?.addEventListener('click', () => Toast.show('Documento técnico: docs/ARCHITECTURE.md.', 'info'));
    document.getElementById('btnBrandGuide')?.addEventListener('click', () => Toast.show('Guías: docs/BRAND_GUIDELINES.md y docs/MARKETING_CLAIMS_REGISTER.md.', 'info'));
  }
};
