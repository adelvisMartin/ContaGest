import { z } from 'zod';
import { decimalSchema } from '../../shared/financial/zod.js';

const optionalText = z.string().trim().max(4000).optional().nullable();
const optionalDate = z.string().trim().min(8).max(50).optional().nullable();

/**
 * Validation authority for Veterinary requests.
 *
 * The 4k text/50-char date limits are intentionally preserved here instead of
 * reusing verticals.shared optionalText/dateText because those shared contracts
 * have different bounds.
 */
export const veterinaryMedicationPrescriptionSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().min(10).optional().nullable(),
  professionalId: z.string().min(10).optional().nullable(),
  medication: z.string().trim().min(2).max(240),
  dose: z.string().trim().min(1).max(240),
  frequency: z.string().trim().min(1).max(240),
  duration: z.string().trim().min(1).max(240),
  instructions: optionalText,
  productId: z.string().uuid().optional().nullable()
}).strict();

export const clinicalInventoryLotSchema = z.object({
  productId: z.string().uuid(),
  lotNumber: z.string().trim().min(1).max(120),
  expiresAt: z.string().date().optional().nullable(),
  receivedQuantity: decimalSchema('quantity',{nonnegative:true,defaultValue:0}),
  unitCost: decimalSchema('money',{nonnegative:true}).optional(),
  notes: optionalText
}).strict();

export const clinicalInventoryConsumptionSchema = z.object({
  prescriptionId: z.string().min(10),
  lotId: z.string().uuid(),
  quantity: decimalSchema('quantity',{positive:true}),
  clinicalActId: z.string().uuid(),
  note: optionalText
}).strict();

export const veterinaryEstimateServiceLineSchema =z.object({
  kind:z.literal('service'),
  description:z.string().trim().min(2).max(240),
  quantity:decimalSchema('quantity',{positive:true}),
  unitPrice:decimalSchema('money',{nonnegative:true}),
  taxRate:decimalSchema('percentage',{nonnegative:true,defaultValue:16})
}).strict();
export const veterinaryEstimateProductLineSchema =z.object({
  kind:z.literal('product'),
  productId:z.string().uuid(),
  quantity:decimalSchema('quantity',{positive:true})
}).strict();
export const veterinaryEstimateLineSchema =z.discriminatedUnion('kind',[
  veterinaryEstimateServiceLineSchema,
  veterinaryEstimateProductLineSchema
]);
export const veterinaryFinancialCaseSchema =z.object({
  patientId:z.string().min(10),
  currency:z.literal('VES').default('VES'),
  lines:z.array(veterinaryEstimateLineSchema).min(1).max(100)
}).strict();
export const veterinaryFinancialAuthorizationSchema =z.object({
  signerName:z.string().trim().min(2).max(180),
  attestation:z.literal(true),
  authorizationText:z.string().trim().min(20).max(10000)
}).strict();
export const veterinaryFinancialCareSchema =z.object({
  careEncounterId:z.string().min(10).optional().nullable(),
  hospitalizationId:z.string().min(10).optional().nullable()
}).strict().superRefine((value,refinement)=>{
  const sources=[value.careEncounterId,value.hospitalizationId].filter(Boolean);
  if(sources.length!==1)refinement.addIssue({code:'custom',path:['careEncounterId'],message:'Selecciona exactamente una fuente clínica: consulta o hospitalización.'});
});
export const veterinaryFinancialInvoiceSchema =z.object({
  inventoryMovementIds:z.array(z.string().uuid()).max(500).default([])
}).strict();
export const veterinaryFinancialQuerySchema =z.object({
  patientId:z.string().min(10).optional()
});
export const VETERINARY_GUARDIAN_PORTAL_SCOPES =['appointments','reminders','discharge','documents','payments','communications'] as const;
export const veterinaryGuardianPortalGrantSchema =z.object({
  patientId:z.string().min(10),
  expiresInHours:z.coerce.number().int().min(1).max(168).default(48),
  scopes:z.array(z.enum(VETERINARY_GUARDIAN_PORTAL_SCOPES)).min(1).max(VETERINARY_GUARDIAN_PORTAL_SCOPES.length).default([...VETERINARY_GUARDIAN_PORTAL_SCOPES])
}).strict();

export const veterinaryBoardingSettingsSchema =z.object({
  enabled:z.boolean()
}).strict();
export const veterinaryBoardingResourceSchema =z.object({
  code:z.string().trim().min(1).max(80),
  name:z.string().trim().min(2).max(180),
  type:z.enum(['cage','kennel','room','isolation','other']).default('cage'),
  location:z.string().trim().max(180).optional().nullable(),
  notes:optionalText
}).strict();
export const veterinaryBoardingResourceStatusSchema =z.object({
  status:z.enum(['active','maintenance','inactive'])
}).strict();
export const veterinaryBoardingAvailabilityQuerySchema =z.object({
  from:z.string().datetime(),
  to:z.string().datetime()
}).strict().superRefine((value,refinement)=>{
  if(new Date(value.to).getTime()<=new Date(value.from).getTime()){
    refinement.addIssue({code:'custom',path:['to'],message:'El fin de disponibilidad debe ser posterior al inicio.'});
  }
});
export const veterinaryBoardingStayQuerySchema =z.object({
  patientId:z.string().min(10).optional(),
  status:z.enum(['reserved','checked_in','completed','cancelled']).optional()
}).strict();
export const veterinaryBoardingStaySchema =z.object({
  patientId:z.string().min(10),
  resourceId:z.string().uuid(),
  startsAt:z.string().datetime(),
  plannedEndsAt:z.string().datetime(),
  notes:optionalText
}).strict().superRefine((value,refinement)=>{
  if(new Date(value.plannedEndsAt).getTime()<=new Date(value.startsAt).getTime()){
    refinement.addIssue({code:'custom',path:['plannedEndsAt'],message:'La salida prevista debe ser posterior al ingreso.'});
  }
});
export const veterinaryBoardingStayTransitionSchema =z.object({
  status:z.enum(['checked_in','completed','cancelled']),
  endedAt:z.string().datetime().optional().nullable()
}).strict();

export const labOrderSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  laboratory: optionalText,
  specimenType: optionalText,
  fasting: z.boolean().default(false),
  notes: optionalText,
  tests: z.array(z.object({
    testCode: z.string().trim().max(80).optional().nullable(),
    testName: z.string().trim().min(2).max(180),
    category: z.string().trim().max(100).optional().nullable(),
    unit: z.string().trim().max(60).optional().nullable(),
    referenceMin: z.coerce.number().optional().nullable(),
    referenceMax: z.coerce.number().optional().nullable(),
    referenceText: z.string().trim().max(240).optional().nullable()
  })).min(1).max(100)
});

export const labResultSchema = z.object({
  labOrderId: z.string().min(10),
  resultId: z.string().min(10).optional().nullable(),
  testCode: z.string().trim().max(80).optional().nullable(),
  testName: z.string().trim().min(2).max(180),
  category: z.string().trim().max(100).optional().nullable(),
  valueText: optionalText,
  valueNumeric: z.coerce.number().optional().nullable(),
  unit: z.string().trim().max(60).optional().nullable(),
  referenceMin: z.coerce.number().optional().nullable(),
  referenceMax: z.coerce.number().optional().nullable(),
  referenceText: z.string().trim().max(240).optional().nullable(),
  observedAt: optionalDate,
  notes: optionalText,
  attachmentPath: optionalText
}).superRefine((value, refinement) => {
  const hasText=Boolean(String(value.valueText||'').trim());
  const hasNumeric=value.valueNumeric!==null&&value.valueNumeric!==undefined;
  if(!hasText&&!hasNumeric) refinement.addIssue({code:'custom',path:['valueNumeric'],message:'El resultado requiere un valor numérico o textual.'});
  if(value.referenceMin!==null&&value.referenceMin!==undefined&&value.referenceMax!==null&&value.referenceMax!==undefined&&value.referenceMin>value.referenceMax){
    refinement.addIssue({code:'custom',path:['referenceMax'],message:'El máximo de referencia debe ser mayor o igual al mínimo.'});
  }
});

export const studySchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  kind: z.enum(['xray', 'ultrasound', 'ct', 'mri', 'ecg', 'endoscopy', 'pathology', 'dental', 'other']).default('other'),
  title: z.string().trim().min(2).max(240),
  bodySite: optionalText,
  status: z.enum(['ordered', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('ordered'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  findings: optionalText,
  impression: optionalText,
  attachmentPath: optionalText,
  externalUrl: z.string().url().optional().nullable().or(z.literal(''))
});

export const hospitalizationSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  admittedAt: optionalDate,
  ward: optionalText,
  cage: optionalText,
  reason: z.string().trim().min(2).max(1000),
  diagnosis: optionalText,
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']).default('admitted'),
  carePlan: z.record(z.string(), z.unknown()).default({})
});

export const hospitalizationStatusSchema = z.object({
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']),
  dischargedAt: optionalDate,
  diagnosis: optionalText
});

export const observationSchema = z.object({
  hospitalizationId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  observedAt: optionalDate,
  type: z.enum(['vitals', 'medication', 'feeding', 'fluid', 'procedure', 'note', 'task']).default('note'),
  values: z.record(z.string(), z.unknown()).default({}),
  note: optionalText
});

export const VETERINARY_TREATMENT_VITAL_UNITS ={
  weight:'kg',
  temperature:'°C',
  heartRate:'lpm',
  respiratoryRate:'rpm'
} as const;
export const VETERINARY_TREATMENT_VITAL_KEYS =Object.keys(VETERINARY_TREATMENT_VITAL_UNITS) as Array<keyof typeof VETERINARY_TREATMENT_VITAL_UNITS>;

export const treatmentSheetEntrySchema = z.object({
  responsibleProfessionalId: z.string().min(10).optional().nullable(),
  category: z.enum(['medication','feeding','fluid','task','observation','vitals']),
  status: z.enum(['scheduled','completed','skipped','cancelled']).default('completed'),
  title: z.string().trim().min(2).max(240),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  note: optionalText,
  details: z.object({
    medication: optionalText,
    dose: optionalText,
    route: optionalText,
    food: optionalText,
    fluid: optionalText,
    amount: optionalText,
    unit: optionalText,
    rate: optionalText,
    temperature: optionalText,
    heartRate: optionalText,
    respiratoryRate: optionalText,
    weight: optionalText
  }).default({})
}).superRefine((value, refinement) => {
  const requireDetail=(field, message)=>{
    if(!String(value.details?.[field]||'').trim()) refinement.addIssue({code:'custom',path:['details',field],message});
  };
  if (value.status === 'scheduled' && !value.scheduledAt) {
    refinement.addIssue({ code:'custom', path:['scheduledAt'], message:'Una tarea programada requiere fecha/hora.' });
  }
  if(value.category==='medication'){
    requireDetail('medication','Indica el medicamento.');
    requireDetail('dose','Indica la dosis registrada manualmente.');
  }
  if(value.category==='feeding')requireDetail('food','Indica la alimentación.');
  if(value.category==='fluid')requireDetail('fluid','Indica el fluido.');
  if(value.category==='observation'&&!String(value.note||'').trim()){
    refinement.addIssue({code:'custom',path:['note'],message:'La observación no puede estar vacía.'});
  }
  if(value.category==='vitals'){
    const vitalEntries=VETERINARY_TREATMENT_VITAL_KEYS
      .map((key)=>[key,String(value.details?.[key]||'').trim()] as const)
      .filter(([,raw])=>raw!=='');
    if(!vitalEntries.length){
      refinement.addIssue({code:'custom',path:['details'],message:'Registra al menos un signo vital.'});
    }
    for(const [key,raw] of vitalEntries){
      if(!Number.isFinite(Number(raw))){
        refinement.addIssue({code:'custom',path:['details',key],message:'El signo vital debe ser numérico.'});
      }
    }
  }
});

export const procedureSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(240),
  kind: z.string().trim().min(2).max(120).default('procedure'),
  status: z.enum(['planned', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('planned'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  anesthesia: optionalText,
  notes: optionalText,
  outcome: optionalText
});

export const communicationSchema = z.object({
  patientId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push']),
  event: z.string().trim().min(2).max(100),
  recipient: z.string().trim().min(3).max(240),
  templateId: z.string().optional().nullable(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'skipped']).default('queued'),
  scheduledAt: optionalDate,
  sentAt: optionalDate,
  providerMessageId: optionalText,
  payload: z.record(z.string(), z.unknown()).default({}),
  error: optionalText
});

export const appointmentStatusSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
  reminderStatus: z.enum(['pending', 'queued', 'sent', 'failed', 'skipped']).optional(),
  notes: optionalText
});
