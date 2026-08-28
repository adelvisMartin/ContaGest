import { PageHeader, Badge, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { mountCgFoundationPilot } from '../components/ui/cg/CgPrimitives.jsx';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const HelpPage = {
  render() {
    const rows = [
      { area:'Frontend', command:'npm run dev:frontend', note:'Vite local con runtime canónico' },
      { area:'Backend', command:'npm run dev:backend', note:'Express/TypeScript y persistencia configurada' },
      { area:'QA', command:'npm run qa:ui:58', note:'Auditoría y browser QA del catálogo vigente' },
      { area:'Producción', command:'npm run qa:production:full', note:'Readiness no sustituye autorización de release' }
    ];

    const table = ErpDataTable({
      caption:'Guía rápida de operación de ContaGest',
      columns:[
        { key:'area', label:'Área' },
        { key:'command', label:'Comando', render:(row) => `<code class="cg-ui-code">${safe(row.command)}</code>` },
        { key:'note', label:'Nota' },
        { key:'status', label:'Estado', render:() => Badge('OK', 'success') }
      ],
      rows
    });

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'helpEyebrow',
      titleKey:'helpTitle',
      descKey:'helpDesc'
    })}${ErpSection({ title:'Búsqueda de ayuda · piloto Cg*', description:'Segunda superficie de bajo riesgo para comprobar fields/buttons/status del Design System sin alterar reglas de negocio.', content:'<div id="cgHelpMuiPilot" data-no-mui></div>' })}${ErpSection({ title:'Operación y soporte', description:'Comandos y consideraciones básicas por área.', content:table })}</section>`;
  },
  mount(state) {
    mountCgFoundationPilot(document.getElementById('cgHelpMuiPilot'), state, 'help');
  }
};
