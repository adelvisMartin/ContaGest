export const curatedSources = [
  { name: 'SENIAT', kind: 'Tributario', url: 'https://seniat.gob.ve', status: 'Referencial' },
  { name: 'Gaceta Oficial', kind: 'Normativa', url: 'https://www.gacetaoficial.gob.ve', status: 'Validación manual' },
  { name: 'Imprenta Nacional', kind: 'Normativa', url: 'https://www.imprentanacional.gob.ve', status: 'Referencial' },
  { name: 'BCV', kind: 'Tasa oficial', url: 'https://www.bcv.org.ve', status: 'Consulta diaria' }
];

export const RegulatoryService = {
  async sources(backendUrl) {
    try {
      const response = await fetch(`${(backendUrl || '').replace(/\/$/, '')}/api/regulatory/sources`);
      if (response.ok) return response.json();
    } catch {}
    return { mode: 'fallback', sources: curatedSources };
  },
  async updates(backendUrl, query = 'iva') {
    try {
      const response = await fetch(`${(backendUrl || '').replace(/\/$/, '')}/api/regulatory/updates?q=${encodeURIComponent(query)}`);
      if (response.ok) return response.json();
    } catch {}
    return { mode: 'fallback', updates: [
      { title: 'Validar Gaceta Oficial antes de aplicar cambios tributarios', source: 'Checklist interno', date: new Date().toISOString().slice(0, 10), summary: `Búsqueda local referencial para ${query}. Backend apagado o fuente no disponible.` },
      { title: 'Revisar providencias SENIAT para IVA/retenciones', source: 'Checklist interno', date: new Date().toISOString().slice(0, 10), summary: 'La app no sustituye documentos oficiales ni comprobantes del portal.' }
    ] };
  }
};
