const digits = (value = '') => String(value || '').replace(/\D+/g, '');
const pad = (value) => String(value).padStart(2, '0');

export function appointmentStart(appointment = {}) {
  if (appointment.startsAt) {
    const parsed = new Date(appointment.startsAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const date = String(appointment.date || '').trim();
  const time = String(appointment.time || '09:00').trim();
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function appointmentEnd(appointment = {}) {
  if (appointment.endsAt) {
    const parsed = new Date(appointment.endsAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const start = appointmentStart(appointment);
  if (!start) return null;
  const duration = Math.max(15, Math.min(240, Number(appointment.durationMinutes || 50)));
  return new Date(start.getTime() + duration * 60000);
}

export function appointmentDurationMinutes(appointment = {}) {
  const start = appointmentStart(appointment);
  const end = appointmentEnd(appointment);
  if (start && end && end > start) return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  return Math.max(15, Math.min(240, Number(appointment.durationMinutes || 50)));
}

function compactUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function patientName(patient = {}) {
  return String(patient.displayName || patient.name || patient.fullName || 'Paciente').trim();
}

export function appointmentLabel(_appointment = {}, patient = {}) {
  return `Consulta de psicología · ${patientName(patient)}`;
}

export function appointmentMessage(appointment = {}, patient = {}, settings = {}) {
  const date = appointmentStart(appointment);
  const locale = String(settings.lang || 'es') === 'pt' ? 'pt-BR' : 'es-VE';
  const formatted = date
    ? new Intl.DateTimeFormat(locale, { dateStyle:'full', timeStyle:'short' }).format(date)
    : `${appointment.date || ''} ${appointment.time || ''}`.trim();
  const practice = settings.companyTradeName || settings.companyName || 'consultorio';
  if (String(settings.lang || 'es') === 'pt') {
    return `Olá ${patientName(patient)}, entramos em contato de ${practice} para confirmar sua consulta de psicologia em ${formatted}. Responda esta mensagem para confirmar ou solicitar uma alteração.`;
  }
  return `Hola ${patientName(patient)}, te escribimos de ${practice} para confirmar tu cita de psicología el ${formatted}. Por favor responde este mensaje para confirmar o solicitar un cambio.`;
}

export function calendarTemplateUrl(appointment = {}, patient = {}, settings = {}) {
  const start = appointmentStart(appointment);
  const end = appointmentEnd(appointment);
  if (!start || !end) return '';
  const modality = appointment.channel === 'telemedicine' ? 'Videollamada' : (appointment.modality || 'Presencial');
  const params = new URLSearchParams({
    action:'TEMPLATE',
    text:appointmentLabel(appointment, patient),
    dates:`${compactUtc(start)}/${compactUtc(end)}`,
    details:`Cita programada desde ContaGest-VE. Modalidad: ${modality}.`,
    location:String(appointment.location || appointment.room || settings.companyAddress || '')
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function emailConfirmationUrl(appointment = {}, patient = {}, settings = {}) {
  const email = String(patient.email || '').trim();
  if (!email) return '';
  const subject = encodeURIComponent(String(settings.lang || 'es') === 'pt' ? 'Confirmação de consulta' : 'Confirmación de cita');
  const body = encodeURIComponent(appointmentMessage(appointment, patient, settings));
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export function whatsappConfirmationUrl(appointment = {}, patient = {}, settings = {}) {
  const phone = digits(patient.phone || patient.mobile || '');
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(appointmentMessage(appointment, patient, settings))}`;
}

export function weekBounds(reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0,0,0,0);
  const day = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export function appointmentsThisWeek(appointments = [], reference = new Date()) {
  const { start, end } = weekBounds(reference);
  return appointments.filter((appointment) => {
    const date = appointmentStart(appointment);
    return date && date >= start && date < end && !['cancelled','completed'].includes(String(appointment.status || '').toLowerCase());
  });
}

export function upcomingAppointments(appointments = [], hours = 24, reference = new Date()) {
  const from = new Date(reference);
  const to = new Date(from.getTime() + Math.max(1, Number(hours || 24)) * 3600000);
  return appointments
    .map((appointment) => ({ appointment, date:appointmentStart(appointment) }))
    .filter(({ appointment, date }) => date && date >= from && date <= to && !['cancelled','completed'].includes(String(appointment.status || '').toLowerCase()))
    .sort((a,b) => a.date - b.date)
    .map(({ appointment }) => appointment);
}

export const AppointmentReminderService = {
  appointmentStart,
  appointmentEnd,
  appointmentDurationMinutes,
  calendarTemplateUrl,
  emailConfirmationUrl,
  whatsappConfirmationUrl,
  appointmentMessage,
  appointmentsThisWeek,
  upcomingAppointments,
  weekBounds
};
