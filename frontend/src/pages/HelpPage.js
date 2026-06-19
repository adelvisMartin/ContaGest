import { PageHeader, Table, Badge } from '../components/ui/index.js';

export const HelpPage = {
  render() {
    const rows = [
      ['Frontend', 'python -m http.server 8080', 'Abrir http://localhost:8080'],
      ['Backend', 'cd backend && npm install && npm run dev', 'Proxy SENIAT, normativa y persistencia JSON'],
      ['QA', 'node tests/qa-check.mjs', 'Valida rutas, módulos, docs y sintaxis'],
      ['Producción', 'Configurar backend real + HTTPS', 'No guardar credenciales en localStorage']
    ].map(([area, command, note]) => `<tr><td>${area}</td><td><code>${command}</code></td><td>${note}</td><td>${Badge('OK','success')}</td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'helpEyebrow', titleKey:'helpTitle', descKey:'helpDesc' })}<div class="panel-soft rounded-[1.5rem] p-4">${Table({ headers:[{label:'Área'}, {label:'Comando'}, {label:'Nota'}, {key:'status'}], rows })}</div></section>`;
  }, mount() {}
};
