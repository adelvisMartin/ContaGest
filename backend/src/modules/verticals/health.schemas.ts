import { z } from 'zod';
import { optionalText, dateText, jsonRecord, jsonArray } from './verticals.shared.js';

export const patientSchema = z.object({
  kind: z.enum(['human','animal']).default('human'),
  firstName: optionalText,
  lastName: optionalText,
  displayName: z.string().trim().min(2).max(180),
  idNumber: optionalText,
  birthDate: z.string().optional().nullable(),
  sex: optionalText,
  phone: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: optionalText,
  photoUrl: optionalText,
  species: optionalText,
  breed: optionalText,
  color: optionalText,
  microchip: optionalText,
  guardianName: optionalText,
  guardianPhone: optionalText,
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  emergencyContact: jsonRecord,
  allergies: optionalText,
  conditions: optionalText,
  notes: optionalText,
  active: z.boolean().default(true)
});

export const professionalSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  specialty: z.string().trim().min(2).max(120).default('general'),
  licenseNumber: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  status: z.enum(['active','inactive','vacation']).default('active'),
  schedule: jsonRecord
});

export const appointmentStatusSchema = z.enum(['waitlisted','scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show']);
export const appointmentSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  startsAt: dateText,
  endsAt: dateText,
  type: z.string().trim().max(120).default('consultation'),
  status: appointmentStatusSchema.default('scheduled'),
  reason: optionalText,
  channel: z.enum(['onsite','telemedicine','home_visit']).default('onsite'),
  room: optionalText,
  recallDueAt: dateText.optional().nullable(),
  notes: optionalText
}).superRefine((value, refinement) => {
  const startsAt=new Date(value.startsAt).getTime();
  const endsAt=new Date(value.endsAt).getTime();
  if(!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt){
    refinement.addIssue({code:'custom',path:['endsAt'],message:'La cita debe terminar después de comenzar.'});
  }
});

export const appointmentPatchSchema = z.object({
  professionalId:z.string().optional().nullable(),
  startsAt:dateText.optional(),
  endsAt:dateText.optional(),
  status:appointmentStatusSchema.optional(),
  reason:optionalText,
  room:optionalText,
  recallDueAt:dateText.optional().nullable(),
  notes:optionalText
}).strict().refine((value)=>Object.keys(value).length>0,{message:'Indica al menos un cambio.'});

const DENTAL_PERMANENT_TEETH = new Set(['11','12','13','14','15','16','17','18','21','22','23','24','25','26','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48']);
const DENTAL_PRIMARY_TEETH = new Set(['51','52','53','54','55','61','62','63','64','65','71','72','73','74','75','81','82','83','84','85']);
export const dentalClinicalDataSchema = z.object({
  tooth: optionalText,
  procedure: optionalText,
  odontogram: z.object({
    dentition: z.enum(['permanent','primary']),
    tooth: z.string().trim().min(2).max(2),
    surfaces: z.array(z.enum(['vestibular','lingual_palatal','mesial','distal','occlusal_incisal'])).min(1).max(5),
    condition: z.string().trim().min(1).max(120)
  }).superRefine((value, refinement) => {
    const catalog = value.dentition === 'primary' ? DENTAL_PRIMARY_TEETH : DENTAL_PERMANENT_TEETH;
    if (!catalog.has(value.tooth)) refinement.addIssue({ code:'custom', path:['tooth'], message:'La pieza no pertenece a la dentición seleccionada.' });
  })
}).passthrough();

const PERIODONTAL_SITE_KEYS = ['mesiobuccal','midbuccal','distobuccal','mesiolingual','midlingual','distolingual'] as const;
export const periodontalSiteSchema = z.object({
  site: z.enum(PERIODONTAL_SITE_KEYS),
  probingDepthMm: z.coerce.number().int().min(0).max(15),
  gingivalMarginMm: z.coerce.number().int().min(-10).max(20),
  bleeding: z.boolean(),
  suppuration: z.boolean(),
  plaque: z.boolean()
});
export const periodontalClinicalDataSchema = z.object({
  periodontogram: z.object({
    dentition: z.enum(['permanent','primary']),
    tooth: z.string().trim().min(2).max(2),
    mobilityGrade: z.coerce.number().int().min(0).max(3),
    furcationGrade: z.coerce.number().int().min(0).max(3),
    sites: z.array(periodontalSiteSchema).length(6)
  }).superRefine((value, refinement) => {
    const catalog = value.dentition === 'primary' ? DENTAL_PRIMARY_TEETH : DENTAL_PERMANENT_TEETH;
    if (!catalog.has(value.tooth)) refinement.addIssue({ code:'custom', path:['tooth'], message:'La pieza no pertenece a la dentición seleccionada.' });
    const uniqueSites = new Set(value.sites.map((site) => site.site));
    if (uniqueSites.size !== PERIODONTAL_SITE_KEYS.length) refinement.addIssue({ code:'custom', path:['sites'], message:'El periodontograma requiere los seis sitios canónicos sin duplicados.' });
  }),
  notes: optionalText
}).passthrough();

const dentalMoneyText = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, 'Monto inválido; usa máximo dos decimales.');
export const dentalTreatmentProcedureSchema = z.object({
  name: z.string().trim().min(2).max(180),
  tooth: optionalText,
  quantity: z.coerce.number().int().min(1).max(99),
  unitPrice: dentalMoneyText
});
export const dentalTreatmentPhaseSchema = z.object({
  order: z.coerce.number().int().min(1).max(50),
  name: z.string().trim().min(2).max(180),
  procedures: z.array(dentalTreatmentProcedureSchema).min(1).max(50)
});
export const dentalTreatmentPlanClinicalDataSchema = z.object({
  treatmentPlan: z.object({
    diagnosis: z.string().trim().min(2).max(2000),
    alternatives: z.array(z.object({
      name:z.string().trim().min(2).max(180),
      description:optionalText
    })).min(1).max(12),
    phases: z.array(dentalTreatmentPhaseSchema).min(1).max(12),
    budget: z.object({
      currency:z.enum(['VES','USD']),
      estimatedTotal:dentalMoneyText.optional()
    }),
    status:z.literal('proposed').default('proposed'),
    acceptance:z.object({ status:z.literal('pending') }).default({status:'pending'})
  }).superRefine((value, refinement) => {
    const allTeeth = new Set([...DENTAL_PERMANENT_TEETH,...DENTAL_PRIMARY_TEETH]);
    value.phases.forEach((phase, phaseIndex) => phase.procedures.forEach((procedure, procedureIndex) => {
      const tooth = String(procedure.tooth || '').trim();
      if (tooth && !allTeeth.has(tooth)) refinement.addIssue({ code:'custom', path:['phases',phaseIndex,'procedures',procedureIndex,'tooth'], message:'La pieza indicada no es válida.' });
    }));
  })
}).passthrough();

export const acceptedDentalTreatmentPlanClinicalDataSchema = z.object({
  treatmentPlan: z.object({
    phases: z.array(dentalTreatmentPhaseSchema).min(1).max(12),
    budget: z.object({
      currency:z.enum(['VES','USD']),
      estimatedTotal:dentalMoneyText
    }),
    status:z.literal('accepted'),
    acceptance:z.object({
      status:z.literal('accepted'),
      decidedAt:z.string().optional().nullable()
    }).passthrough()
  }).passthrough()
}).passthrough();

export const dentalFinancialQuerySchema = z.object({
  patientId:z.string().min(10).optional()
});

export const treatmentPlanDecisionSchema = z.object({
  decision:z.enum(['accepted','rejected']),
  reason:optionalText
}).superRefine((value, refinement) => {
  if(value.decision==='rejected'&&!String(value.reason||'').trim()) refinement.addIssue({code:'custom',path:['reason'],message:'El rechazo requiere un motivo.'});
});

export const dentalEncounterWorkflowSchema = z.object({
  action:z.enum(['submit-review','sign'])
});

export const veterinaryPreventiveClinicalDataSchema = z.object({
  preventiveCare:z.object({
    kind:z.enum(['deworming','checkup']),
    name:z.string().trim().min(2).max(180),
    performedAt:z.string().optional().nullable(),
    nextDueAt:z.string().optional().nullable(),
    notes:optionalText
  })
}).passthrough();

export const encounterSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  specialty: z.string().trim().max(120).default('general'),
  type: z.string().trim().max(120).default('consultation'),
  subjective: optionalText,
  objective: optionalText,
  assessment: optionalText,
  plan: optionalText,
  diagnosisCodes: jsonArray,
  clinicalData: jsonRecord,
  confidential: z.boolean().default(false),
  status: z.enum(['draft','review','signed','amended','cancelled']).default('draft')
}).superRefine((value, refinement) => {
  if (value.type === 'dental-treatment') {
    const parsed = dentalClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
    if (value.status !== 'draft') refinement.addIssue({ code:'custom', path:['status'], message:'Los tratamientos odontológicos nuevos deben iniciar como borrador.' });
  }
  if (value.type === 'periodontal-chart') {
    const parsed = periodontalClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
  }
  if (value.type === 'dental-treatment-plan') {
    const parsed = dentalTreatmentPlanClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
    if(value.status!=='draft') refinement.addIssue({code:'custom',path:['status'],message:'Los planes nuevos deben iniciar como borrador propuesto.'});
  }
  if (value.type === 'veterinary-preventive') {
    const parsed = veterinaryPreventiveClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
    if(value.status!=='signed') refinement.addIssue({code:'custom',path:['status'],message:'Los preventivos veterinarios registrados deben quedar firmados.'});
  }
});

export const dentalEncounterAmendmentSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  professionalId: z.string().optional().nullable(),
  subjective: optionalText,
  assessment: optionalText,
  plan: optionalText,
  clinicalData: dentalClinicalDataSchema
});

export const measurementSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  kind: z.string().trim().min(1).max(100),
  value: z.coerce.number(),
  unit: z.string().trim().min(1).max(40),
  measuredAt: z.string().optional(),
  metadata: jsonRecord
});

const VETERINARY_VITAL_UNITS={
  weight:'kg',
  temperature:'°C',
  heart_rate:'lpm',
  respiratory_rate:'rpm'
} as const;
export const veterinaryVitalKindSchema =z.enum(['weight','temperature','heart_rate','respiratory_rate']);
export const veterinaryVitalBatchSchema =z.object({
  patientId:z.string().min(10),
  encounterId:z.string().min(10).optional().nullable(),
  batchId:z.string().uuid(),
  measuredAt:z.string().datetime({offset:true}).optional().nullable(),
  measurements:z.array(z.object({
    kind:veterinaryVitalKindSchema,
    value:z.coerce.number().finite(),
    unit:z.enum(['kg','°C','lpm','rpm'])
  }).strict()).min(1).max(4)
}).strict().superRefine((value,refinement)=>{
  const seen=new Set<string>();
  for(const [index,item] of value.measurements.entries()){
    if(seen.has(item.kind)){
      refinement.addIssue({code:'custom',path:['measurements',index,'kind'],message:'Cada signo vital puede registrarse una sola vez por toma.'});
    }
    seen.add(item.kind);
    if(item.unit!==VETERINARY_VITAL_UNITS[item.kind]){
      refinement.addIssue({code:'custom',path:['measurements',index,'unit'],message:'La unidad no corresponde al signo vital.'});
    }
  }
});

export const immunizationSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  vaccine: z.string().trim().min(2).max(180),
  dose: optionalText,
  lot: optionalText,
  administeredAt: z.string().optional(),
  nextDueAt: z.string().optional().nullable(),
  notes: optionalText
});
