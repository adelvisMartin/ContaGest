-- #824: guard the new ambulatory-visit subtype without rewriting existing Care/Dental encounters.
-- Combined with row locks and the same-transaction appointment transition, this
-- prevents two independent sessions from producing two ambulatory visits for one appointment.
CREATE UNIQUE INDEX "CareEncounter_one_ambulatory_visit_per_appointment_v824"
  ON public."CareEncounter" ("tenantId", "appointmentId")
  WHERE "type"='ambulatory-visit' AND "appointmentId" IS NOT NULL;
