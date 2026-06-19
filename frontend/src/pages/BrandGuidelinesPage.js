import { EnterpriseButton } from '../components/ui/index.js';
import { downloadText } from '../utils/dom.js';

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="84" viewBox="0 0 320 84" fill="none"><rect x="28" y="22" width="12" height="30" fill="#00236f"/><rect x="44" y="14" width="12" height="38" fill="#1e3a8a"/><rect x="60" y="8" width="12" height="44" fill="#5b6f96"/><path d="M88 30h118" stroke="#00236f" stroke-width="4" stroke-linecap="round"/><text x="88" y="48" font-family="Inter, Arial" font-size="18" font-weight="700" fill="#00236f">ContaGest-VE</text></svg>`;

const ColorBox = ({ title, subtitle, hex, className = '' }) => `
  <div class="brand-color ${className}">
    <div><p>${title}</p><small>${subtitle}</small></div>
    <div class="brand-color-bottom"><span>${hex}</span><b>${title === 'Azul Enterprise' ? 'BG-PRIMARY' : 'TOKEN'}</b></div>
  </div>`;

export const BrandGuidelinesPage = {
  render() {
    const content = `
      <section class="hf-brand-guide">
        <header class="hf-brand-header">
          <div><h2>Manual de Marca Resumido</h2><p>Guía de identidad visual, interfaz y arquitectura técnica para ContaGest-VE.</p></div>
          <div class="hf-actions compact">${EnterpriseButton({ id:'btnBrandAssets', text:'Assets ZIP', icon:'download', variant:'secondary' })}${EnterpriseButton({ id:'btnTechDoc', text:'Doc. Técnica PDF', icon:'api', variant:'secondary' })}${EnterpriseButton({ id:'btnBrandGuide', text:'Guía Completa PDF', icon:'picture_as_pdf', variant:'primary' })}</div>
        </header>
        <div class="brand-stack">
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">fingerprint</span><h3>Identidad y Propuesta de Valor</h3></div>
            <div class="brand-two-col">
              <div><p class="cgv-label">El nombre</p><h4>ContaGest-VE</h4><p>Una fusión de <strong>Contabilidad</strong> y <strong>Gestión</strong>, focalizada en el entorno corporativo de <strong>Venezuela (VE)</strong>. Transmite autoridad, control y especificidad geográfica sin perder el tono corporativo global.</p></div>
              <div><p class="cgv-label">Propuesta de valor</p><div class="brand-quote">“Precisión financiera potenciada por Inteligencia Artificial, con total cumplimiento de la localización fiscal venezolana. Sistema blindado con seguridad backend avanzada y arquitectura multi-inquilino robusta.”</div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">architecture</span><h3>Arquitectura Técnica y APIs</h3></div>
            <div class="brand-two-col">
              <div><p class="cgv-label">Integración de APIs Externas</p><ul><li><strong>BCV (Banco Central de Venezuela):</strong> Sincronización automática de tasas de cambio oficiales.</li><li><strong>SENIAT:</strong> Validación de RIF y retenciones de IVA/ISLR en tiempo real.</li><li><strong>Bancos Nacionales:</strong> Conciliación bancaria automatizada y pasarelas de pago.</li></ul></div>
              <div><p class="cgv-label">Backend & Seguridad</p><div class="brand-quote"><p><strong>Arquitectura Multi-inquilino:</strong> aislamiento estricto de datos por empresa, garantizando escalabilidad y privacidad.</p><p><strong>Seguridad Blindada:</strong> encriptación de extremo a extremo, auditoría de transacciones y RBAC.</p></div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">branding_watermark</span><h3>Logotipo Principal</h3></div>
            <div class="logo-grid">
              <div><p class="brand-mini-label">Sobre Fondo Claro (Principal)</p><div class="logo-stage logo-stage-light"><div class="safe-area"><i>X</i><i>X</i><i>X</i><i>X</i></div>${logoSvg}</div><div class="brand-links"><button>SVG</button><button>PNG</button></div></div>
              <div><p class="brand-mini-label">Sobre Fondo Oscuro (Secundario)</p><div class="logo-stage logo-stage-dark"><div class="dark-dot-grid"></div><div class="white-logo-box">${logoSvg}</div></div><div class="brand-links"><button>SVG (White)</button><button>PNG (White)</button></div></div>
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-card-title"><span class="material-symbols-outlined">palette</span><h3>Paleta de Colores</h3></div>
            <div class="brand-color-grid">${ColorBox({ title:'Azul Enterprise', subtitle:'Primary Brand Color', hex:'#00236f', className:'primary' })}${ColorBox({ title:'Dark Surface', subtitle:'UI Backgrounds', hex:'#0f172a', className:'dark' })}</div>
            <div class="token-grid"><div class="token-chip"><b style="background:#505f76"></b><span>Secondary<small>#505f76</small></span></div><div class="token-chip"><b style="background:#f7f9fb"></b><span>Canvas Base<small>#f7f9fb</small></span></div><div class="token-chip error"><b style="background:#ba1a1a"></b><span>Error / Alert<small>#ba1a1a</small></span></div><div class="token-chip"><b style="background:#757682"></b><span>Outline<small>#757682</small></span></div></div>
          </section>
          <div class="brand-bottom-grid">
            <section class="brand-card"><div class="brand-card-title"><span class="material-symbols-outlined">text_fields</span><h3>Tipografía: Inter</h3></div><div class="type-row"><span>Display KPI (700)</span><small>48px / 56px</small><strong>Bs. 45,230.00</strong></div><div class="type-row"><span>Headline MD (600)</span><small>24px / 32px</small><strong class="headline">Balance General Mensual</strong></div><div class="type-row"><span>Body MD (400)</span><small>16px / 24px</small><p>La tipografía principal asegura legibilidad en tablas densas y dashboards financieros complejos.</p></div></section>
            <section class="brand-card"><div class="brand-card-title"><span class="material-symbols-outlined">category</span><h3>Iconografía</h3></div><p>Utilizamos <strong>Material Symbols Outlined</strong>. Peso: 400. Las versiones Fill se reservan para estados activos.</p><code>font-variation-settings: 'FILL' 0, 'wght' 400;</code><div class="icon-grid"><div><span class="material-symbols-outlined">analytics</span><small>analytics</small></div><div><span class="material-symbols-outlined">request_quote</span><small>quote</small></div><div><span class="material-symbols-outlined">account_balance</span><small>balance</small></div><div><span class="material-symbols-outlined">smart_toy</span><small>AI Agent</small></div></div><div class="active-icon-state"><span>Estado Activo (FILL: 1)</span><span class="material-symbols-outlined">grid_view</span><span class="material-symbols-outlined">notifications</span></div></section>
          </div>
          <footer class="brand-footer">© 2024 ContaGest-VE. Todos los derechos reservados. Diseño bajo el sistema Precision Ledger.</footer>
        </div>
      </section>`;
    return content;
  },
  mount(_state, { Toast }) {
    const content = `ContaGest-VE Brand Assets\nPrimary: #00236f\nContainer: #1e3a8a\nSurface: #f7f9fb\nDark: #0f172a`;
    document.getElementById('btnBrandAssets')?.addEventListener('click', () => { downloadText('contagest-ve-brand-assets.txt', content); Toast.show('Assets de marca exportados.', 'success'); });
    document.getElementById('btnTechDoc')?.addEventListener('click', () => Toast.show('Documento técnico preparado en docs/ARCHITECTURE.md.', 'info'));
    document.getElementById('btnBrandGuide')?.addEventListener('click', () => Toast.show('Guía de marca disponible en docs/BRAND_GUIDELINES.md.', 'info'));
  }
};
