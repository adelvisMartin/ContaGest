# #824 — Tenant seguro en encuentros ambulatorios Care

La consulta GET de encuentros ya filtra por tenant y paciente, pero el JOIN de profesionales no incluía tenantId. El join ahora alinea `pr.tenantId=e.tenantId` además del ID profesional. En POST, la referencia opcional `appointmentId` se valida contra `tenantId` e `patientId` antes de insertar el encuentro, conservando el control previo de paciente/profesional y las reglas de anamnesis.

Regresiones de contrato cubren ambos predicados y el orden fail-closed previo a la escritura. Falta prueba PostgreSQL 17 real con tenants A/B, HTTP y UI; esta corrección no implica un flujo ambulatorio completo. #824 sigue OPEN. Sin cambios de esquema, migraciones ni datos históricos.