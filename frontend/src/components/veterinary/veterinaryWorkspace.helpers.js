export const TABS = [
  ['resumen', 'Resumen', 'fa-chart-pie'], ['pacientes', 'Mascotas', 'fa-paw'], ['agenda', 'Agenda', 'fa-calendar-days'],
  ['historia', 'Historia clínica', 'fa-file-waveform'], ['laboratorio', 'Laboratorio', 'fa-flask-vial'], ['estudios', 'Estudios', 'fa-x-ray'],
  ['hospitalizacion', 'Hospitalización', 'fa-house-medical'], ['boarding', 'Estancia', 'fa-door-open'], ['procedimientos', 'Procedimientos', 'fa-stethoscope'], ['finanzas', 'Finanzas', 'fa-file-invoice-dollar'], ['tutor', 'Portal tutor', 'fa-user-shield'], ['comunicaciones', 'Comunicaciones', 'fa-message']
];
export const STATUS_TONE = { scheduled:'info', confirmed:'success', checked_in:'warning', in_progress:'warning', completed:'success', cancelled:'default', no_show:'error', ordered:'info', processing:'warning', admitted:'error', observed:'warning', discharged:'success', critical:'error', high:'warning', low:'warning', abnormal:'warning', normal:'success', active:'success', pending:'warning', signed:'success', sent:'success', delivered:'success', failed:'error' };
export const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const Icon = ({ name, size = 14 }) => <i className={`fa-solid ${name}`} style={{ fontSize:size }} aria-hidden="true" />;
export const compactDate = (value) => value ? new Date(value).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : '—';
export const onlyDate = (value) => value ? new Date(value).toLocaleDateString('es-VE') : '—';
export const phoneDigits = (value) => String(value || '').replace(/\D/g, '');
export const displayError = (error) => error?.message || 'No se pudo completar la operación.';
export const reportVeterinaryError = (scope,error) => {
  console.error('[veterinary]', {
    scope,
    name:error?.name || 'Error',
    message:displayError(error),
    status:error?.status || error?.statusCode || null
  });
};
export const arrayData = (value) => Array.isArray(value) ? value : value?.data || [];
export const objectData = (value) => value?.data || value || {};
export const shortCode = (value) => String(value || '').replaceAll('-', '').slice(0, 8).toUpperCase();
export const localDateTime = (minutes = 0) => {
  const date = new Date(Date.now() + minutes * 60000 - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
export const localDateTimeFromIso = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
