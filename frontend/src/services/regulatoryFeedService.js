import { BackendApi } from './backendApi.js';

export const REGULATORY_SOURCES = [
  { key: 'ifrs-taxonomy-2025', name: 'IFRS Accounting Taxonomy 2025', kind: 'NIIF/XBRL', mode: 'download', url: 'https://www.ifrs.org/issued-standards/ifrs-taxonomy/ifrs-accounting-taxonomy-2025/' },
  { key: 'ifrs-digital-reporting', name: 'IFRS Digital Financial Reporting', kind: 'NIIF digital', mode: 'reference', url: 'https://www.ifrs.org/digital-financial-reporting/' },
  { key: 'fccpv-biblioteca', name: 'Biblioteca FCCPV', kind: 'Venezuela', mode: 'watch', url: 'https://biblioteca.fccpv.org/' },
  { key: 'fccpvirtual', name: 'Federación Virtual FCCPV', kind: 'Validaciones', mode: 'watch', url: 'https://fccpvirtual.org/' }
];

export const RegulatoryFeedService = {
  async refresh() {
    try { return await BackendApi.get('/api/v1/regulatory/feeds'); }
    catch (error) { return { ok: false, offline: true, data: REGULATORY_SOURCES.map((s) => ({ ...s, status: 'pendiente', error: 'Usando catálogo local' })) }; }
  },
  async importIfrsTaxonomy() {
    try { return await BackendApi.post('/api/v1/regulatory/ifrs-taxonomy/import', {}); }
    catch (error) { return { ok: false, offline: true, error: error.message }; }
  }
};
