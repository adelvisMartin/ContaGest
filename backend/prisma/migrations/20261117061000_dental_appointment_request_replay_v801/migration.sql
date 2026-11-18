-- #801: durable retry identity within the existing CareAppointment authority.
CREATE UNIQUE INDEX "CareAppointment_dental_tenant_request_unique"
  ON public."CareAppointment" ("tenantId", (("schedulingMeta"->>'requestKey')))
  WHERE "type"='dentistry' AND "schedulingMeta"->>'requestKey' IS NOT NULL;
