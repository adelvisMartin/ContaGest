# #797 — Integridad del outbox offline compartido

En `pwaOfflineService.js` se corrigieron dos fallas: IndexedDB `put` reemplazaba el contenido de una operación anterior con el mismo `idempotencyKey`; `flushOfflineOutbox` borraba un evento tras cualquier promesa resuelta, incluso un rechazo o una respuesta ambigua. Ahora se usa `add` para conservar la identidad original y se requiere ACK positivo `{ok:true}`, `{delivered:true}` o estado HTTP 2xx sin contradicción. Las respuestas vacías, falsas, ambiguas y errores HTTP mantienen el registro y detienen el orden de envío.

El formato de claves se restringe a 8–128 caracteres seguros. **No se ha habilitado ninguna mutación de entrenamientos sin conexión**: el allowlist sigue limitado a `analytics.event` hasta que el backend tenga idempotencia, CAS y pruebas tenant A/B para sets y sesiones. Los datos siguen bajo la purga ya existente de usuario/tenant.

Evidencia ejecutada: 8/8 pruebas focales en V8 sobre el archivo de la rama, probando funciones reales `flushOfflineOutbox`, ACK y `enqueueOfflineOperation` (lectura/borrado de IndexedDB sustituidos por un fixture). No se ejecutó IndexedDB real, dos pestañas, service worker, navegador, prueba con pérdida de conectividad ni backend. El ticket #797 permanece OPEN. No se han desactivado checks. Rollback: revertir este cambio con revisión de integridad del outbox.
