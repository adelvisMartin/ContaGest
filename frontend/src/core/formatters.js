const numberFormat = (currency, locale = 'es-VE') => new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plainFormat = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw || raw === 'Invalid Date') return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const bs = (value = 0) => numberFormat('VES').format(Number(value) || 0);
export const usd = (value = 0) => numberFormat('USD', 'en-US').format(Number(value) || 0);
export const eur = (value = 0) => numberFormat('EUR', 'es-ES').format(Number(value) || 0);
export const number = (value = 0) => plainFormat.format(Number(value) || 0);
export const percent = (value = 0) => `${plainFormat.format(Number(value) || 0)}%`;
export const shortDate = (value) => {
  const date = parseDateValue(value);
  return date ? date.toLocaleDateString('es-VE') : '-';
};
export const dateTime = (value) => {
  const date = parseDateValue(value);
  return date ? date.toLocaleString('es-VE') : '-';
};
