# ADR · #567 Privacidad clínica técnica

Este ADR define fronteras técnicas de minimización y acceso; **no certifica cumplimiento legal o regulatorio**. Cualquier conclusión legal permanece en #29.

## Datos y acceso

`clinical-data-map-v567.json` clasifica identidad clínica, encuentros y blobs. Los recorridos clínicos usan `health.manage`; las búsquedas y exports se filtran por tenant en servidor. El export clínico se construye desde PostgreSQL para un `patientId` del tenant activo y registra sólo metadata de auditoría (formato y cantidad), nunca el contenido clínico en `AuditLog`.

## Media privada

El bucket clínico permanece privado. Las rutas existentes usan claves prefijadas por tenant y URLs firmadas con TTL finito; no existen URLs clínicas permanentes. La autoridad adicional `assertClinicalStorageAccess` valida tenant, bucket, estado activo y paciente contra `DataStorageObject`. El acceso/listado/firma de media clínica queda auditado por metadata de ruta/método/resultado, sin adjuntar notas o contenido.

## Observabilidad y UI/API

Logger redacts campos clínicos estructurados (`clinicalData`, SOAP-like fields, diagnósticos, alergias, condiciones y notas). Errores 5xx siguen el envelope seguro de #565. Las respuestas de export incluyen `Cache-Control: no-store`; cualquier pantalla/toast debe mostrar estados operativos, no contenido clínico completo innecesario.

## Proveedores externos

El asistente externo queda deshabilitado salvo aprobación operativa explícita mediante `OPENAI_OPERATIONAL_EXTERNAL_APPROVED=true`. Aun con esa aprobación, un payload con señales clínicas se bloquea antes del fetch externo y el chat usa el motor local. La política no considera a OpenAI —ni a ningún otro proveedor— aprobado para datos clínicos. Añadir esa capacidad requiere revisión separada, minimización explícita y actualización versionada del data map/policy.

## Retención y QA

Retención/legal hold/delete pertenecen a #562 y `ClinicalMediaObject` continúa clasificado como protegido. QA usa tenant UUID aislado, pacientes marcados `SYNTHETIC` y un sandbox local de objetos; nunca se copian historias, imágenes o identificadores reales.
