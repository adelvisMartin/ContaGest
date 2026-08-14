import { PageHeader, Badge, ErpDataTable, ErpSection } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const HelpPage = {
  render() {
    const rows = [
      { area:'Frontend', command:'python -m http.server 8080', note:'Abrir http://localhost:8080' },
      { area:'Backend', command:'cd backend && npm install && npm run dev', note:'Proxy SENIAT, normativa y persistencia JSON' },
      { area:'QA', command:'node tests/qa-check.mjs', note:'Valida rutas, módulos, docs y sintaxis' },
      { area:'Producción', command:'Configurar backend real + HTTPS', note:'No guardar credenciales en localStorage' }
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
    })}${ErpSection({ title:'Operación y soporte', description:'Comandos y consideraciones básicas por área.', content:table })}</section>`;
  },
  mount() {}
};
