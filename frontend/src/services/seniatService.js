import { normalizeRif, isValidRif } from '../core/validators.js';

export const SeniatService = {
  async lookup(rif, backendUrl) {
    const clean = normalizeRif(rif);
    if (!isValidRif(clean)) throw new Error('Formato RIF inválido. Ejemplo: J123456789.');
    const base = (backendUrl || 'http://localhost:3030').replace(/\/$/, '');
    const response = await fetch(`${base}/api/seniat/rif/${encodeURIComponent(clean)}`);
    if (!response.ok) throw new Error('No se pudo consultar SENIAT desde el backend.');
    return response.json();
  }
};
