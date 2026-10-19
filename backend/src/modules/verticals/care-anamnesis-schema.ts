import { z } from 'zod';
import { careAnamnesisConsistencyIssues } from './care-anamnesis-consistency.js';

/** #800 — typed patient-reported history in the existing CareEncounter authority.
 * Declarative input is NOT an independently verified clinical diagnosis. */
export const careAnamnesisClinicalDataSchema = z.object({
  schemaVersion: z.literal('care-anamnesis-v1'),
  declaredBy: z.enum(['patient','guardian','professional']),
  allergyReview: z.enum(['unreviewed','none_reported','reported']),
  allergies: z.array(z.object({
    substance: z.string().trim().min(2).max(160),
    reaction: z.string().trim().max(320).optional().nullable(),
    status: z.enum(['current','resolved']).default('current')
  }).strict()).max(50).default([]),
  medications: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    dose: z.string().trim().max(120).optional().nullable(),
    status: z.enum(['current','stopped']).default('current')
  }).strict()).max(50).default([]),
  conditions: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    status: z.enum(['reported','resolved']).default('reported')
  }).strict()).max(50).default([])
}).strict().superRefine((value, refinement)=>{
  for(const issue of careAnamnesisConsistencyIssues(value)) {
    refinement.addIssue({code:'custom',path:issue.path,message:issue.message});
  }
});
