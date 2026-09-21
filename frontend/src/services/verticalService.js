import { BackendApi } from './backendApi.js';
import { MediaService } from './mediaService.js';

const query = (params = {}) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, item]) => item !== undefined && item !== null && item !== '')).toString();
  return value ? `?${value}` : '';
};

async function createWithPhoto(create, payload, entityType, altField) {
  const { photoDataUrl = '', ...data } = payload || {};
  const record = await create(data);
  if (!photoDataUrl) return record;
  const media = await MediaService.upload({ entityType, entityId: record.id, dataUrl: photoDataUrl, alt: record?.[altField] || '' });
  return { ...record, photoPath: media.path, photoUrl: media.signedUrl };
}

export const HealthVerticalService = {
  summary() { return BackendApi.get('/verticals/health/summary'); },
  async patients(params = {}) { return MediaService.signRecords(await BackendApi.get(`/verticals/health/patients${query(params)}`)); },
  createPatient(payload) { return createWithPhoto((data) => BackendApi.post('/api/v1/verticals/health/patients', data), payload, 'care-patient', 'displayName'); },
  updatePatient(id, payload) { return BackendApi.request(`/verticals/health/patients/${encodeURIComponent(id)}`, { method:'PATCH', body:payload }); },
  archivePatient(id) { return BackendApi.delete(`/api/v1/verticals/health/patients/${encodeURIComponent(id)}`); },
  professionals() { return BackendApi.get('/verticals/health/professionals'); },
  createProfessional(payload) { return BackendApi.post('/api/v1/verticals/health/professionals', payload); },
  appointments(params = {}) { return BackendApi.get(`/verticals/health/appointments${query(params)}`); },
  createAppointment(payload) { return BackendApi.post('/api/v1/verticals/health/appointments', payload); },
  updateAppointment(id, payload) { return BackendApi.request(`/verticals/health/appointments/${encodeURIComponent(id)}`, { method:'PATCH', body:payload }); },
  deleteAppointment(id) { return BackendApi.delete(`/api/v1/verticals/health/appointments/${encodeURIComponent(id)}`); },
  encounters(patientId) { return BackendApi.get(`/verticals/health/encounters${query({ patientId })}`); },
  createEncounter(payload) { return BackendApi.post('/api/v1/verticals/health/encounters', payload); },
  amendEncounter(id, payload) { return BackendApi.post(`/api/v1/verticals/health/encounters/${encodeURIComponent(id)}/amend`, payload); },
  transitionDentalEncounter(id, payload) { return BackendApi.post(`/api/v1/verticals/health/encounters/${encodeURIComponent(id)}/workflow`, payload); },
  decideTreatmentPlan(id, payload) { return BackendApi.post(`/api/v1/verticals/health/encounters/${encodeURIComponent(id)}/treatment-plan-decision`, payload); },
  createMeasurement(payload) { return BackendApi.post('/api/v1/verticals/health/measurements', payload); },
  createImmunization(payload) { return BackendApi.post('/api/v1/verticals/health/immunizations', payload); },
  prescriptions(patientId) { return BackendApi.get(`/verticals/health/prescriptions${query({ patientId })}`); },
  createPrescription(payload) { return BackendApi.post('/api/v1/verticals/health/prescriptions', payload); },
  consents(patientId) { return BackendApi.get(`/verticals/health/consents${query({ patientId })}`); },
  createConsent(payload) { return BackendApi.post('/api/v1/verticals/health/consents', payload); },
  signDentalConsent(payload) { return BackendApi.post('/api/v1/verticals/health/consents/dental-treatment', payload); },
  revokeConsent(id, payload) { return BackendApi.post(`/api/v1/verticals/health/consents/${encodeURIComponent(id)}/revoke`, payload); }
};

export const VeterinaryService = {
  dashboard() { return BackendApi.get('/verticals/veterinary/dashboard'); },
  labOrders(params = {}) { return BackendApi.get(`/verticals/veterinary/lab-orders${query(params)}`); },
  createLabOrder(payload) { return BackendApi.post('/api/v1/verticals/veterinary/lab-orders', payload); },
  labResults(params = {}) { return BackendApi.get(`/verticals/veterinary/lab-results${query(params)}`); },
  createLabResult(payload) { return BackendApi.post('/api/v1/verticals/veterinary/lab-results', payload); },
  studies(params = {}) { return BackendApi.get(`/verticals/veterinary/studies${query(params)}`); },
  createStudy(payload) { return BackendApi.post('/api/v1/verticals/veterinary/studies', payload); },
  hospitalizations(params = {}) { return BackendApi.get(`/verticals/veterinary/hospitalizations${query(params)}`); },
  createHospitalization(payload) { return BackendApi.post('/api/v1/verticals/veterinary/hospitalizations', payload); },
  updateHospitalizationStatus(id, payload) { return BackendApi.request(`/verticals/veterinary/hospitalizations/${encodeURIComponent(id)}/status`, { method:'PATCH', body:payload }); },
  observations(hospitalizationId) { return BackendApi.get(`/verticals/veterinary/observations${query({ hospitalizationId })}`); },
  createObservation(payload) { return BackendApi.post('/api/v1/verticals/veterinary/observations', payload); },
  procedures(params = {}) { return BackendApi.get(`/verticals/veterinary/procedures${query(params)}`); },
  createProcedure(payload) { return BackendApi.post('/api/v1/verticals/veterinary/procedures', payload); },
  communications(params = {}) { return BackendApi.get(`/verticals/veterinary/communications${query(params)}`); },
  createCommunication(payload) { return BackendApi.post('/api/v1/verticals/veterinary/communications', payload); },
  updateAppointmentStatus(id, payload) { return BackendApi.request(`/verticals/veterinary/appointments/${encodeURIComponent(id)}/status`, { method:'PATCH', body:payload }); }
};

export const GymVerticalService = {
  summary() { return BackendApi.get('/verticals/gym/summary'); },
  async members(params = {}) { return MediaService.signRecords(await BackendApi.get(`/verticals/gym/members${query(params)}`)); },
  createMember(payload) { return createWithPhoto((data) => BackendApi.post('/api/v1/verticals/gym/members', data), payload, 'gym-member', 'fullName'); },
  trainers() { return BackendApi.get('/verticals/gym/trainers'); },
  createTrainer(payload) { return BackendApi.post('/api/v1/verticals/gym/trainers', payload); },
  plans() { return BackendApi.get('/verticals/gym/plans'); },
  createPlan(payload) { return BackendApi.post('/api/v1/verticals/gym/plans', payload); },
  createMembership(payload) { return BackendApi.post('/api/v1/verticals/gym/memberships', payload); },
  updateMembershipStatus(id, payload) { return BackendApi.request(`/verticals/gym/memberships/${encodeURIComponent(id)}/status`, { method:'PATCH', body:payload }); },
  checkIn(payload) { return BackendApi.post('/api/v1/verticals/gym/checkins', payload); },
  assessments(memberId) { return BackendApi.get(`/verticals/gym/assessments${query({ memberId })}`); },
  createAssessment(payload) { return BackendApi.post('/api/v1/verticals/gym/assessments', payload); },
  routines(memberId = '') { return BackendApi.get(`/verticals/gym/routines${query({ memberId })}`); },
  createRoutine(payload) { return BackendApi.post('/api/v1/verticals/gym/routines', payload); },
  nutrition(memberId = '') { return BackendApi.get(`/verticals/gym/nutrition${query({ memberId })}`); },
  createNutrition(payload) { return BackendApi.post('/api/v1/verticals/gym/nutrition', payload); },
  classes() { return BackendApi.get('/verticals/gym/classes'); },
  createClass(payload) { return BackendApi.post('/api/v1/verticals/gym/classes', payload); },
  classBookings(classId) { return BackendApi.get(`/verticals/gym/classes/${encodeURIComponent(classId)}/bookings`); },
  bookClass(payload) { return BackendApi.post('/api/v1/verticals/gym/classes/bookings', payload); },
  payments(memberId = '') { return BackendApi.get(`/verticals/gym/payments${query({ memberId })}`); },
  createPayment(payload) { return BackendApi.post('/api/v1/verticals/gym/payments', payload); }
};

export const CommunicationTemplateService = {
  list(vertical = '') { return BackendApi.get(`/verticals/communications/templates${query({ vertical })}`); },
  save(payload) { return BackendApi.post('/api/v1/verticals/communications/templates', payload); },
  render(payload) { return BackendApi.post('/api/v1/verticals/communications/render', payload); }
};

