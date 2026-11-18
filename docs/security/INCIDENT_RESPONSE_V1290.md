# #1290 · Respuesta a incidentes de ContaGest y Control Hípico

**Estado de esta entrega: PLAN OPERATIVO, NO EJECUTADO.** No certifica rotación, revocación, simulacros ni protección de producción. Las autorizaciones para tocar entornos reales, credenciales y datos siguen siendo externas a este documento. Este runbook orquesta las autoridades existentes; no crea un nuevo mecanismo de autenticación, un kill switch ficticio ni procedimientos destructivos.

## Límites y autoridades

- Incidentes de autenticación, sesiones, tokens, permisos, BOLA/RLS, exportaciones, cambios contables y accesos al runtime/DB: responsabilidad de ContaGest, con inventario de controles y evidencia de [#651](SECURITY_CLOSURE_V651.md).
- Privilegios DB, credenciales runtime/DDL/backup/monitor y restauración: [runbook de recuperación](../DATABASE_SECURITY_RECOVERY_RUNBOOK.md). Las migraciones son forward-only y los backups se restauran primero en PostgreSQL aislado.
- Backup y recuperación de Control Hípico: [hipico_backup](../hipico/HIPICO_BACKUP_ROLE_ACTIVATION.md) y #842. SOURCE permanece sin automatización de lectura ni envío no autorizada; LAB sintético es el único destino de ejercicios de integración.
- Promoción y rollback de aplicación: [runbook de producción #566](../RUNBOOK_PRODUCTION_V566.md), #840 y #669. Ningún despliegue ni prueba documental equivale a producción verificada.

## 1. Activación y triage (operador de guardia)

Abrir un registro restringido de incidente con **ID**, hora UTC de primera señal, hora UTC de conocimiento, producto, entorno, SHA de 40 caracteres del build realmente servido si se conoce, síntoma, actor operativo responsable y responsable de aprobación. Registrar sólo nombres lógicos de credenciales, nunca sus valores.

| Severidad provisional | Criterio de activación | Primera decisión |
| --- | --- | --- |
| P0 / crítica | Acceso confirmado entre tenants, suplantación activa, alteración contable no autorizada, compromiso owner/DDL, recuperación comprometida o pérdida masiva | Congelar promociones; preservar evidencia; evaluar contención inmediata con operador y responsable de datos |
| P1 / alta | Token o credencial expuesta, exportación indebida probable, abuso sostenido de permisos, efecto duplicado en ledger | Restringir el vector **confirmado** y validar revocación con pruebas negativas |
| P2 / investigativa | Señal sospechosa sin acceso/impacto confirmado | Recolectar hechos y monitorizar; no revocar ni reiniciar recursos indiscriminadamente |

Una alerta 401/403 por sí sola no prueba intrusión. Tasa de errores, fallos de auth, exportaciones, latencia y anomalías de saldo requieren baseline observado por entorno antes de definir umbrales. No publicar umbrales inventados.

## 2. Preservación de evidencias, acceso mínimo y comunicaciones

1. Congelar SHA y configuración *lógica* del candidate: commit, manifest de migraciones, nombre del deployment, versiones de frontend/backend, hora UTC y correlation/request ID sin identidad personal.
2. Exportar **únicamente registros permitidos y redactados**: no contraseñas, JWT, cookies, URLs firmadas, RIF, nombres de pacientes, datos clínicos, payloads de pagos ni contenido de grupos de mensajería. Cifrar y controlar acceso/retención fuera del repositorio.
3. Registrar origen, custodio, hora UTC y SHA-256 de cada artefacto. El hash prueba integridad de bytes, **no** ejecución auténtica de un test.
4. Mantener un responsable de incidente, un responsable de DB/contabilidad y un revisor de seguridad distinto del ejecutor cuando exista escalamiento P0/P1. Registrar decisiones y cambios de severidad.
5. Comunicar internamente hechos confirmados, alcance conocido/desconocido, operaciones suspendidas y próximo punto de decisión. Avisos a afectados y obligaciones legales requieren revisión por responsable autorizado; no copiar PII a GitHub.

## 3. Contención: decisión reversible y verificable

**Nunca asumir que existe un flag genérico de mantenimiento, bloqueo por tenant o kill switch.** Antes de utilizar uno, identificar su archivo/config real, autorización, propietario, alcance por tenant/función, reversión y resultado de prueba en staging. Si no existe mecanismo verificado, clasificar la contención propuesta como **BLOCKED** y escalar al operador del proveedor; no añadir un endpoint improvisado.

| Vector confirmado | Contención autorizable | Verificación mínima |
| --- | --- | --- |
| Sesión o token comprometido | Invalidación/revocación por la autoridad de sesiones existente; si cambia firma, coordinar ventana de renovación | Token anterior → 401/403; token nuevo autorizado → respuesta esperada sin tenant B |
| Credencial runtime DB | Rotar desde gestor de secretos; redeploy controlado; retirar despliegues que conservan la versión anterior | Identidad runtime = rol esperado sin DDL/BYPASSRLS; old credential denegada |
| Credencial owner/DDL | Suspender migraciones, rotar owner/DDL y revisar grants/policies/functions antes de reabrir runtime | Diferencia de esquema/roles reconciliada contra manifest aprobado |
| API/permiso/exportación | Restringir la ruta/permiso mediante controles existentes y autorizados, no por ocultar botones | Pruebas negativas directas HTTP para tenant A→B y B→A, mismo actor/permiso |
| Ledger o cierres alterados | Congelar efectos de escritura que se puedan restringir de forma segura; preservar historia y usar reversos/compensaciones autorizadas | Reconciliación de saldos, asientos, idempotency keys y audit trail sin borrado de transacciones |
| Hípico Bridge/LAB | Desconectar sólo el destino afectado de forma verificable y conservar journal/ACK; nunca redirigir a SOURCE por fallback | Reinicio/reconexión sin cambio de destino ni doble entrega |

No ejecutar `db push`, `db reset`, `TRUNCATE`, borrados de ledger, cambios de RLS o restauraciones encima de origen para «resolver» el incidente. Separar rollback de aplicación de recuperación de DB.

## 4. Procedimiento de revocación y rotación

Inventariar, **sin valores**, cada secreto afectado: nombre lógico, servicio dueño, entorno, permisos actuales, expiración/revocación disponible, dependencias, custodio y ubicación del procedimiento de recuperación.

Orden de ejecución por dependencias y radio de impacto, aprobado para cada caso: crear nueva versión en secret manager → actualizar consumidores legítimos → comprobar health/readiness y ruta positiva con credencial nueva → revocar anterior → demostrar denegación de acceso anterior → verificar que no permanecen instancias con la credencial comprometida. En firma de JWT/sesiones, definir de antemano si se invalida toda la sesión o existe solapamiento controlado. Nunca mantener dos claves indefinidamente por conveniencia.

Para DB, usar el procedimiento de roles/seguridad de [recuperación](../DATABASE_SECURITY_RECOVERY_RUNBOOK.md). Como verificación **read-only** en entorno aprobado y autenticado, el proyecto documenta:

```bash
git rev-parse --verify HEAD
psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/database/verify-security-roles.sql
```

La segunda línea requiere una identidad administrativa autorizada; **no ejecutar contra producción desde un CI/prueba** ni imprimir el DSN. Registrar sólo resultado y SHA con artefactos saneados.

## 5. Tabletop obligatorio en staging efímero

Preparar checkout exacto y PostgreSQL 17 **aislado y desechable**, datos ficticios de dos tenants independientes, credenciales efímeras y transacciones financieras ficticias reconciliables. Ninguna prueba usa cuentas/pacientes/grupos reales ni una base compartida. El operador designa escenarios y criterio de parada antes de ejecutarlos.

| Escenario | Prueba positiva y negativa obligatoria | Evidencia |
| --- | --- | --- |
| Credencial expuesta | Nueva credencial funciona con alcance mínimo; anterior no autentica después de revocación | Resultado, timestamps, rol lógico, SHA; sin secretos |
| Token/sesión revocados | Ruta A funciona antes; token invalidado falla; otra sesión/tenant sigue aislada | Respuestas 401/403 saneadas y registros de sesión |
| BOLA / cross-tenant | A→B y B→A denegados en API, servicio y DB cuando el contrato RLS lo exige | Caso, recurso sintético, expected/received, correlation ID |
| Exportación / observabilidad | Exportación no autorizada falla; logs y artefactos sin PII ni credenciales | Lista de campos permitidos y hashes |
| Error monetario / recuperación | Journal/ledger intactos; rollback/compensación y restore drill *en otra DB* | Antes/después contable, constraints, integridad, RPO/RTO observados |
| Hípico backup / recuperación | Rol de backup sólo lectura, inventario 25/25 cuando sea STEADY_STATE, restore y aislamiento SOURCE/LAB | Reportes reales del verificador #842 y restauración |

Cronometrar **detectado→reconocido**, **reconocido→contenido**, duración de recuperación y brechas observadas. Registrar hora inicial/final UTC, actor, caso, comando/runner, artifact, hash y SHA. Si algo no pudo ejecutarse, escribir `BLOCKED` o `NOT_EXECUTED`, nunca `PASS`.

## 6. Go/No-Go, reversión y cierre

- **NO-GO:** credenciales previas todavía activas, acceso entre tenants, audit trail roto, saldos divergentes, restauración no verificada, SOURCE sin autorización, PR SHA distinto al probado o un hallazgo P0/P1 sin dueño y evidencia.
- **Restauración de servicio:** reabrir sólo el mecanismo de contención aplicado y documentado, con aprobador, verificación de sesión/permisos, contrato de API, finanzas, PostgreSQL y señales de telemetría; detener si los resultados discrepan.
- **Cierre:** registrar causa raíz, línea de tiempo, alcance real, matriz de blast radius, cambios reversibles, pruebas de revocación y recovery, mediciones, comunicación aprobada y tareas con issue/owner. Adjuntar la evidencia al gate #651 y consumirla en #669/#840/#841; fusionar una documentación no equivale a satisfacer esos gates.

### Estado de implementación de #1290

Este archivo es una **base ejecutable por el operador en cuanto se provean permisos y entorno autorizados**. Falta validar en staging la revocación, medir tiempos reales, integrar alertas calibradas y completar tabletop/restore. **El ticket #1290 permanece abierto.**
