import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

const pets = [
  {
    id: 'pet-0000000001', kind: 'animal', displayName: 'Luna', species: 'Canino', breed: 'Border Collie',
    color: 'Negro y blanco', sex: 'female', birthDate: '2021-05-14', microchip: '981020000001001',
    guardianName: 'María González', guardianPhone: '+584121234567', guardianEmail: 'maria@example.com',
    allergies: 'Ninguna conocida', conditions: 'Control dermatológico', active: true
  },
  {
    id: 'pet-0000000002', kind: 'animal', displayName: 'Simón', species: 'Felino', breed: 'Doméstico',
    color: 'Naranja', sex: 'male', birthDate: '2020-10-02', microchip: '981020000001002',
    guardianName: 'Carlos Pérez', guardianPhone: '+584241234567', guardianEmail: 'carlos@example.com',
    allergies: '', conditions: '', active: true
  }
];

const professionals = [
  { id: 'professional-0001', fullName: 'Dra. Ana Ruiz', specialty: 'Medicina veterinaria general', status: 'active' },
  { id: 'professional-0002', fullName: 'Dr. José León', specialty: 'Diagnóstico por imágenes', status: 'active' }
];

const appointments = [
  {
    id: 'appointment-0001', patientId: pets[0].id, patientKind: 'animal', patientName: 'Luna',
    professionalId: professionals[0].id, professionalName: professionals[0].fullName,
    startsAt: '2026-07-31T14:00:00.000Z', endsAt: '2026-07-31T14:30:00.000Z',
    reason: 'Control dermatológico', status: 'confirmed', channel: 'onsite'
  },
  {
    id: 'appointment-0002', patientId: pets[1].id, patientKind: 'animal', patientName: 'Simón',
    professionalId: professionals[1].id, professionalName: professionals[1].fullName,
    startsAt: '2026-07-31T16:00:00.000Z', endsAt: '2026-07-31T16:30:00.000Z',
    reason: 'Ecografía abdominal', status: 'scheduled', channel: 'onsite'
  }
];

const encounters = [
  {
    id: 'encounter-0001', patientId: pets[0].id, specialty: 'Medicina veterinaria general',
    professionalName: professionals[0].fullName, status: 'signed', createdAt: '2026-07-25T12:00:00.000Z',
    subjective: 'Prurito recurrente.', objective: 'Eritema leve en región abdominal.',
    assessment: 'Dermatitis alérgica probable.', plan: 'Baño medicado y control en 14 días.'
  }
];

const labOrders = [
  {
    id: 'lab-order-0001', patientId: pets[0].id, patientName: 'Luna', orderNumber: 'VET-LAB-20260731-AB12CD34',
    orderedAt: '2026-07-30T12:00:00.000Z', status: 'processing', priority: 'routine',
    laboratory: 'Laboratorio interno', resultCount: 2, abnormalCount: 1
  }
];

const labResults = [
  {
    id: 'lab-result-0001', labOrderId: labOrders[0].id, patientId: pets[0].id, orderNumber: labOrders[0].orderNumber,
    testName: 'Hemoglobina', category: 'Hematología', valueNumeric: 14.2, unit: 'g/dL',
    referenceMin: 12, referenceMax: 18, flag: 'normal', observedAt: '2026-07-30T15:00:00.000Z'
  },
  {
    id: 'lab-result-0002', labOrderId: labOrders[0].id, patientId: pets[0].id, orderNumber: labOrders[0].orderNumber,
    testName: 'ALT', category: 'Bioquímica', valueNumeric: 132, unit: 'U/L',
    referenceMin: 10, referenceMax: 100, flag: 'high', observedAt: '2026-07-30T15:00:00.000Z'
  }
];

const studies = [
  {
    id: 'study-0001', patientId: pets[0].id, patientName: 'Luna', kind: 'ultrasound', title: 'Ecografía abdominal',
    bodySite: 'Abdomen', status: 'completed', performedAt: '2026-07-28T11:00:00.000Z',
    findings: 'Hígado ligeramente aumentado.', impression: 'Hepatomegalia leve.'
  }
];

const hospitalizations = [
  {
    id: 'hospitalization-0001', patientId: pets[0].id, patientName: 'Luna', admissionNumber: 'VET-HOSP-20260731-AB12CD34',
    admittedAt: '2026-07-31T09:00:00.000Z', ward: 'Observación', cage: 'A-04', reason: 'Monitoreo postoperatorio',
    diagnosis: 'Postoperatorio estable', status: 'observed', observationCount: 4
  }
];

const procedures = [
  {
    id: 'procedure-0001', patientId: pets[0].id, patientName: 'Luna', name: 'Limpieza dental', kind: 'dental',
    status: 'scheduled', scheduledAt: '2026-08-02T13:00:00.000Z', anesthesia: 'General inhalatoria', outcome: ''
  }
];

const communications = [
  {
    id: 'communication-0001', patientId: pets[0].id, patientName: 'Luna', appointmentId: appointments[0].id,
    channel: 'whatsapp', event: 'appointment_reminder', recipient: '+584121234567', status: 'sent',
    createdAt: '2026-07-30T18:00:00.000Z'
  }
];

function payload(data) { return { ok: true, data }; }

async function installTestSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      token: 'playwright-signed-session-placeholder',
      tenantId: 'tenant-playwright-qa',
      expiresAt: Date.now() + 60 * 60 * 1000,
      mode: 'qa'
    }));
    localStorage.setItem('contagest_auto_sync_enabled', 'false');
  });
}

async function installApiMocks(page) {
  await installTestSession(page);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();

    if (method !== 'GET') {
      const body = request.postDataJSON?.() || {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload({ id: `created-${Date.now()}`, ...body })) });
    }

    const response = (() => {
      if (path === '/verticals/veterinary/dashboard') return {
        patients: 2, appointmentsToday: { total: 2, pending: 1 }, pendingLabOrders: 1,
        abnormalResults: 1, hospitalized: 1, vaccinesDue: 1
      };
      if (path === '/verticals/health/patients') return pets;
      if (path === '/verticals/health/professionals') return professionals;
      if (path === '/verticals/health/appointments') return appointments;
      if (path === '/verticals/health/encounters') return url.searchParams.get('patientId') === pets[0].id ? encounters : [];
      if (path === '/verticals/health/prescriptions') return [{ id: 'prescription-0001', medication: 'Prednisona', dose: '5 mg', frequency: 'Cada 24 h', duration: '5 días', status: 'active' }];
      if (path === '/verticals/health/consents') return [{ id: 'consent-0001', kind: 'Procedimiento con anestesia', signerName: 'María González', status: 'signed' }];
      if (path === '/verticals/veterinary/lab-orders') return labOrders;
      if (path === '/verticals/veterinary/lab-results') return labResults;
      if (path === '/verticals/veterinary/studies') return studies;
      if (path === '/verticals/veterinary/hospitalizations') return hospitalizations;
      if (path === '/verticals/veterinary/procedures') return procedures;
      if (path === '/verticals/veterinary/communications') return communications;
      if (path === '/verticals/veterinary/observations') return [];
      return [];
    })();

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload(response)) });
  });

  await page.route('https://esm.sh/**', (route) => route.abort());
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}

async function openVeterinary(page, viewport, tab = 'resumen') {
  await page.setViewportSize(viewport);
  await installApiMocks(page);
  await page.goto(`/?module=veterinaria&tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Clínica veterinaria', exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-route', 'veterinaria');
  await expect(page).toHaveURL(/module=veterinaria/);
  await waitForStableLayout(page,'#pages');
}

async function expectNoPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport:document.documentElement.clientWidth, document:document.documentElement.scrollWidth, body:document.body.scrollWidth }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 2);
}

mkdirSync('test-results/screenshots', { recursive: true });

for (const testCase of [
  { name:'mobile', viewport:{width:375,height:812} },
  { name:'tablet', viewport:{width:768,height:1024} },
  { name:'desktop', viewport:{width:1440,height:900} }
]) {
  test(`veterinary workspace is compact and responsive on ${testCase.name}`, async ({ page }) => {
    await openVeterinary(page,testCase.viewport);
    await expect(page.getByText('Mascotas activas')).toBeVisible();
    await expect(page.getByRole('tab',{name:/Laboratorio/})).toBeVisible();
    await expectNoPageOverflow(page);
    const headingSize=await page.getByRole('heading',{name:'Clínica veterinaria',exact:true}).evaluate((node)=>Number.parseFloat(getComputedStyle(node).fontSize));
    expect(headingSize).toBeLessThanOrEqual(testCase.name==='desktop'?32:26);
    await page.screenshot({path:`test-results/screenshots/veterinary-${testCase.name}.png`,fullPage:true});
  });
}

test('veterinary tabs and patient selection persist in query params', async ({ page }) => {
  await openVeterinary(page,{width:1440,height:900});
  await page.getByRole('tab',{name:/Laboratorio/}).click();
  await expect(page).toHaveURL(/tab=laboratorio/);
  await expect(page.getByText('Órdenes de laboratorio')).toBeVisible();
  await page.getByRole('tab',{name:/Mascotas/}).click();
  await expect(page).toHaveURL(/tab=pacientes/);
  await expect(page.getByPlaceholder('Buscar mascota, tutor o microchip')).toBeVisible();
  await page.locator('.MuiListItemButton-root').filter({hasText:'Luna'}).click();
  await expect(page).toHaveURL(new RegExp(`tab=pacientes.*patient=${pets[0].id}`));
  await expect(page.getByText('María González',{exact:true})).toBeVisible();

  const selectedPatientUrl = page.url();
  await page.goto('/?module=pretesting', { waitUntil:'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-route','pretesting');
  await page.goBack({ waitUntil:'domcontentloaded' });
  await expect(page).toHaveURL(selectedPatientUrl);
  await expect(page.locator('body')).toHaveAttribute('data-route','veterinaria');
  await expect(page.getByText('María González',{exact:true})).toBeVisible();
});

test('pretesting legacy hero uses the compact global density layer', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  await installApiMocks(page);
  await page.goto('/?module=pretesting',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.pretest-hero h2')).toBeVisible();
  await expect.poll(
    async () => page.locator('.pretest-hero h2').evaluate((node)=>Number.parseFloat(getComputedStyle(node).fontSize)),
    { message:'El hero debe conservar una tipografía compacta después de la carga diferida.' }
  ).toBeLessThanOrEqual(37);
  await expectNoPageOverflow(page);
  await page.screenshot({path:'test-results/screenshots/pretesting-desktop.png',fullPage:true});
});
