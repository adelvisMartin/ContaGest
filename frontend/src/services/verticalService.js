import '../styles/verticals.css';
import { BackendApi } from './backendApi.js';

const query = (params = {}) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, item]) => item !== undefined && item !== null && item !== '')).toString();
  return value ? `?${value}` : '';
};

export const HealthVerticalService = {
  summary() { return BackendApi.get('/verticals/health/summary'); },
  patients(params = {}) { return BackendApi.get(`/verticals/health/patients${query(params)}`); },
  createPatient(payload) { return BackendApi.post('/api/v1/verticals/health/patients', payload); },
  professionals() { return BackendApi.get('/verticals/health/professionals'); },
  createProfessional(payload) { return BackendApi.post('/api/v1/verticals/health/professionals', payload); },
  appointments(params = {}) { return BackendApi.get(`/verticals/health/appointments${query(params)}`); },
  createAppointment(payload) { return BackendApi.post('/api/v1/verticals/health/appointments', payload); },
  encounters(patientId) { return BackendApi.get(`/verticals/health/encounters${query({ patientId })}`); },
  createEncounter(payload) { return BackendApi.post('/api/v1/verticals/health/encounters', payload); },
  createMeasurement(payload) { return BackendApi.post('/api/v1/verticals/health/measurements', payload); },
  createImmunization(payload) { return BackendApi.post('/api/v1/verticals/health/immunizations', payload); },
  prescriptions(patientId) { return BackendApi.get(`/verticals/health/prescriptions${query({ patientId })}`); },
  createPrescription(payload) { return BackendApi.post('/api/v1/verticals/health/prescriptions', payload); },
  consents(patientId) { return BackendApi.get(`/verticals/health/consents${query({ patientId })}`); },
  createConsent(payload) { return BackendApi.post('/api/v1/verticals/health/consents', payload); }
};

export const GymVerticalService = {
  summary() { return BackendApi.get('/verticals/gym/summary'); },
  members(params = {}) { return BackendApi.get(`/verticals/gym/members${query(params)}`); },
  createMember(payload) { return BackendApi.post('/api/v1/verticals/gym/members', payload); },
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
