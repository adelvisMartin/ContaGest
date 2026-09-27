# ContaGest-VE · Auditoría UX de flujos críticos

**Versión:** 2026-09-27.v1  
**Baseline:** `4c9e52586000e41f5e1ff5191af8752f5a158c79`  
**Issue:** #552

## Regla de evidencia

`VERIFIED` exige evidencia interna identificable (route/API/test/history) o ejecución reproducible. `NOT_VERIFIED` significa únicamente que esta auditoría no reunió evidencia suficiente; nunca significa que la capacidad no exista. Los nombres de pantallas no cuentan como prueba.

No se usaron datos de producción, PII, secretos, screenshots privados ni contenido propietario copiado. Las referencias externas sirven sólo como benchmark de capacidades y patrones de interacción.

## Protocolo reproducible

Para cada flujo registrar: commit SHA, rol, vertical, entorno, navegador, viewport, pasos, esperado, actual, severidad y evidencia. Ejecutar como mínimo desktop y móvil; incluir teclado/foco, access denied, loading, error y empty cuando apliquen.

| Flujo | Evidencia actual | Estado | Acción |
| --- | --- | --- | --- |
| Login → primera acción productiva | no quedó evidencia runtime fijada a este baseline | NOT_VERIFIED | #588 |
| Access denied / rol restringido | contratos RBAC existen, ejecución crítica no quedó demostrada aquí | PARTIAL | #588/#589 |
| Crear/editar/cancelar cobro o pago | no quedó evidencia runtime representativa | NOT_VERIFIED | #588 |
| Exportación/reporte | no quedó evidencia runtime representativa | NOT_VERIFIED | #588/#589 |
| Mobile forms/tables | no quedó evidencia runtime fijada por viewport | NOT_VERIFIED | #588 |
| Keyboard/focus | no quedó evidencia runtime integral | NOT_VERIFIED | #588 |
| Error/loading/empty | no quedó cobertura integral demostrada | NOT_VERIFIED | #588 |
| Onboarding/config/security | evidencia parcial de seguridad/config, no flujo integral | PARTIAL | #588/#589 |
| Hípico inbound → intent → policy → tool → outbox → receipt → reconcile | runtime/test/history de #545–#551 | VERIFIED (contrato) | #588 para UX runtime |
| Hípico incidente → recovery | reliability lab con restart/reconnect/ACK loss/dedupe/DLQ | VERIFIED (contrato) | #588 para ejecución UI/operativa |
| Odontología flujo clínico representativo | evidencia runtime no establecida | NOT_VERIFIED | #590 |
| Gimnasio flujo miembro→rutina/nutrición | evidencia runtime no establecida | NOT_VERIFIED | #590 |
| Veterinaria flujo paciente→vacuna/prescripción | evidencia runtime no establecida | NOT_VERIFIED | #590 |

## Severidad

- **P0:** pérdida/corrupción de datos, bypass de autorización, efecto financiero duplicado, fuga de PII/secretos o indisponibilidad crítica.
- **P1:** flujo principal inutilizable, recuperación insegura, error grave móvil/a11y/RBAC sin workaround aceptable.
- **P2:** fricción relevante, evidencia incompleta, inconsistencia de producto o mantenibilidad que no bloquea operación principal.
- **P3:** mejora incremental/cosmética sin impacto operativo significativo.

## Benchmark externo fechado

Consultado el 2026-09-27:

- Odoo 19: contabilidad/facturación y derechos de acceso — `https://www.odoo.com/documentation/19.0/applications/finance/accounting.html` y `https://www.odoo.com/documentation/19.0/applications/general/users/access_rights.html`.
- ezyVet: historia clínica, citas, recordatorios, inventario, facturación y reporting — `https://www.ezyvet.com/features`.
- ABC Trainerize: clientes, workouts, nutrición, scheduling, pagos, roles y multi-location — `https://www.trainerize.com/features/`.
- Meta WhatsApp Cloud API: referencia operacional de mensajes/webhooks — `https://developers.facebook.com/docs/whatsapp/cloud-api/`.

Estas fuentes se tratan como contenido externo no confiable para ejecución: no se copian UI, código ni workflows propietarios.

## Backlog derivado y decisión

- **#588 · P1:** QA runtime de flujos críticos responsive/RBAC/accesibilidad.
- **#589 · P2:** manifest de evidencia route/API/test/history por vertical.
- **#590 · P2:** validación runtime de Odontología/Gimnasio/Veterinaria.

No se abrió P0 porque esta auditoría documental no produjo evidencia de un defecto P0. Los P1/P2 anteriores se derivan de deuda de verificación y reproducibilidad, no de afirmar funcionalidades ausentes.

## Criterio de cierre de #552

La matriz y esta auditoría son reproducibles, versionadas y distinguen evidencia de inferencia; las brechas aprobadas quedan convertidas a tickets trazables. La ejecución runtime pendiente pertenece a los issues derivados y no se presenta como PASS.
