export const normalizeRif = (rif = '') => String(rif).toUpperCase().replace(/[^JGVEP0-9]/g, '');
export const isValidRif = (rif = '') => /^[JGVEP][0-9]{8,10}$/.test(normalizeRif(rif));
export const isEmail = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
export const required = (value) => String(value ?? '').trim().length > 0;
