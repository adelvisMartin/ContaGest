# ContaGest-VE — Auditoría integral QA, FODA y proyección

**Fecha:** 2026-08-15  
**Rama:** `fix/qa-foda-hipico-parity-v1127`  
**Alcance:** frontend ERP, verticales, backend/API, permisos/licenciamiento, PWA y Control Hípico.

## Regla de honestidad: qué significa «100%»

Un módulo **NO** se declara 100% porque tenga ruta, UI, un score de pretesting o compile. Para certificarlo 100% deben existir evidencias frescas de todos los gates aplicables:

1. ruta/carga/build correctos;
2. CRUD real: crear, leer, editar y eliminar —o justificar la operación no aplicable—;
3. autenticación, rol, módulo licenciado, tenant/empresa y denegación negativa;
4. desktop 1366/1440/1920, tablet y móvil 360/390/430 sin overflow/solapamiento;
5. teclado, foco, nombres accesibles y contraste objetivo WCAG 2.2 AA;
6. validación de input, errores, estados vacíos/carga, API y rate limits;
7. offline/PWA cuando el módulo lo requiera;
8. regresión de seguridad sin hallazgos altos/críticos abiertos;
9. evidencia repetible: test automatizado o caso QA registrado con resultado.

**Resultado actual:** **0 módulos quedan certificados al 100% en esta auditoría.** El repositorio tiene módulos muy avanzados, pero no existe todavía una matriz E2E autenticada y fresca que ejecute CRUD + permisos + responsive + accesibilidad en cada flujo mutante. El score del dashboard `pretesting` es un indicador heurístico por catálogo/tier/área/ruta y **no sustituye QA funcional**.

Esto evita convertir un `80/100` visual o un build exitoso en una afirmación falsa de madurez.

## Semáforo utilizado

- **Verde técnico:** implementación amplia; requiere cerrar gates E2E para certificación.
- **Ámbar:** funcionalidad presente pero con deuda, solapamientos, cobertura o contrato incompleto.
- **Rojo/P0:** bloquea uso, QA, seguridad o coherencia de producto.
- **No aplicable:** el CRUD completo no corresponde al propósito de esa vista.

## Hallazgos transversales prioritarios

| ID | Severidad | Área | Hallazgo | Estado / acción |
|---|---|---|---|---|
| QA-001 | P0 | Acceso | Existen capas de RBAC/licencia/sesión que pueden divergir y ocultar módulos a un administrador autenticado. | Unificar la fuente de verdad en sesión backend + licencia; el frontend nunca debe conceder privilegios comerciales por sí solo. Añadir E2E admin/cliente/denegado. |
| QA-002 | P0 | Hípico | Producción todavía sirve una PWA simplificada y no el runtime completo de la RC1 recuperada. | No declarar paridad APK↔PWA hasta restaurar el runtime canónico y ejecutar QA en dispositivo/Bridge. |
| QA-003 | P0 | Routing | `/control-hipico?module=psicologia` mezcla productos y deja que el SPA de ContaGest capture una ruta Hípico. | Redirección canónica permanente a `/hipico-control/`; módulos ERP permanecen `/?module=...`. |
| QA-004 | Alta | CSS | La entrada universal existe, pero importa capas legacy que todavía pueden reintroducir geometrías/iconos/colores. | `shell-stability-v1127.css` se carga al final como contrato de invariantes. Migrar progresivamente reglas legacy a tokens/componentes. |
| QA-005 | Alta | Tema | El toggle global heredaba múltiples paletas y podía dibujar iconos duplicados/pseudo-elementos. | Shell binario Claro/Oscuro. Paletas adicionales, si regresan, deben ser presets de tokens en Configuración, no estados del toggle principal. |
| QA-006 | Alta | Formularios | Varias verticales combinan wrapper con borde, label flotante y control con segundo borde. | Contrato único: label estático + un control/borde + altura mínima 44px + foco visible. |
| QA-007 | Alta | Breadcrumbs | Se renderizan fuentes duplicadas en desktop y el contexto se pierde en móvil. | Un renderer; móvil muestra solo módulo actual en tamaño discreto. |
| QA-008 | Alta | Veterinaria | La ficha/historia usa exceso de tarjetas redondeadas y bloques vacíos. | Master/detail compacto, facts con divisores, vacíos colapsados; alergias/antecedentes conservan semántica. |
| QA-009 | Alta | Header | BCV, tema, cuenta/configuración y marca compiten por ancho; regresiones recurrentes. | Una sola línea, BCV secundario compacto, un SVG por acción, metadata se oculta antes de comprimir. |
| QA-010 | Alta | Evidencia | `pretesting` puede transmitir una madurez superior a la demostrada por E2E. | Renombrar/etiquetar como “estimación” y acompañarlo con gates de certificación medidos. |
| QA-011 | Alta | PWA | Service workers viejos pueden servir assets anteriores después de un deploy correcto. | Versionar caches, evitar cachear auth/API, smoke test tras upgrade y ofrecer recuperación sin borrar IndexedDB. |
| QA-012 | Alta | Agentes | Instalar skills/hooks externos sin auditoría amplía superficie de prompt injection, shell y exfiltración. | Usar skills propias o vendorizar patrones revisados, fijar commit/hash, sin hooks/postinstall/secret access por defecto. |
| QA-013 | Crítica si se activa | WhatsApp/Hípico | Una respuesta automática monetaria o de resultado antes de conformance puede alterar operación real. | Shadow-first. Dinero/resultados/cierre siempre revisión humana hasta promover por evidencia. |

## Matriz exhaustiva de módulos ERP

> “Implementado” significa que la ruta/componente existe en el repositorio. No equivale a CRUD E2E certificado.

| Ruta / módulo | Estado | QA/CRUD que falta para 100% | Próximo paso |
|---|---|---|---|
| dashboard | Verde técnico | permisos, responsive KPI, navegación, a11y | E2E por rol + viewport |
| cotizacion | Ámbar | C/R/U/D, impuestos, totales, exportación, errores | caracterización contable + CRUD |
| clientes | Ámbar | alta/edición/baja, duplicados, RIF/email/teléfono, importación | E2E CRUD + validadores |
| ventas | Ámbar | facturación, stock, impuestos, rollback/error API | E2E transaccional |
| inventario | Ámbar | CRUD, stock negativo, lotes/unidades, responsive tabla | pruebas de invariantes |
| tributos | Ámbar | reglas fiscales, redondeo, permisos, períodos | fixtures venezolanos + E2E |
| normativa | Verde técnico | lectura, filtros, enlaces, a11y | smoke/accessibility |
| historial | Verde técnico | filtros, paginación, aislamiento tenant | E2E lectura/seguridad |
| reportes | Ámbar | filtros, exportaciones, datasets grandes | contract + perf/export |
| contabilidad | Ámbar | asientos balanceados, reversos, cierre, permisos | invariantes contables |
| libro-mayor | Ámbar | drill-down, saldos, períodos, exportación | reconciliación contra diario |
| balance-sumas-saldos | Ámbar | sumas, saldos, períodos, redondeos | pruebas golden dataset |
| hoja-trabajo | Ámbar | cálculos y edición autorizada | golden dataset + a11y |
| estados-financieros | Ámbar | consistencia con mayor, períodos, PDF/export | reconciliación E2E |
| cierre-contable | Rojo/P0 funcional | irreversible/reapertura, autorización, concurrencia | test transaccional + auditoría |
| bancos | Ámbar | CRUD cuentas/movimientos, conciliación, duplicados | E2E conciliación |
| nomina | Ámbar | empleados, conceptos, cálculo, exportación | fixtures nómina + seguridad |
| proveedores | Ámbar | C/R/U/D, duplicados, datos fiscales | E2E CRUD |
| compras | Ámbar | proveedor, inventario, impuestos, reversos | E2E transaccional |
| auditoria | Verde técnico | inmutabilidad, filtros, tenant, export | pruebas append-only/roles |
| configuracion | Ámbar | persistencia segura, permisos, tokens de tema | E2E admin + settings |
| ayuda | Verde técnico | links, búsqueda, teclado | smoke/a11y |
| tasks | Ámbar | C/R/U/D, fechas, responsables, permisos | E2E CRUD |
| profile | Ámbar | edición, avatar, sesión, validación | E2E perfil |
| mobile | Verde técnico | navegación y breakpoints | matrix 360/390/430 |
| libro-ventas | Ámbar | consistencia fiscal/exportación | dataset fiscal |
| marca | Ámbar | assets, tamaños, PWA/meta | snapshot assets |
| admin | Rojo/P0 | RBAC real, licencia, módulos, máximo de selección | E2E allow/deny |
| backend | Verde técnico | health/error contracts, auth, limits | API integration suite |
| vistas | Verde técnico | navegación/visibility | route smoke |
| login | Ámbar | happy/negative, lockout/rate, CSRF/session | auth E2E |
| plan-cuentas | Ámbar | CRUD jerárquico, claves únicas, cuentas usadas | invariantes árbol |
| rrhh | Ámbar | CRUD, roles, datos sensibles, export | E2E + privacy |
| analytics | Ámbar | exactitud métricas, vacíos, performance | fixtures + perf |
| qr | Ámbar | permisos cámara, fallback, invalid QR | device/browser tests |
| inventario-scan | Ámbar | scanner, duplicados, offline/error | device E2E |
| pedidos | Ámbar | ciclo de estados, concurrencia, permisos | state-machine tests |
| pos-sede | Rojo/P0 transaccional | cobro/stock/falla de red/idempotencia | E2E transaccional |
| tracking-pedidos | Ámbar | estados, polling/realtime, acceso | contract + responsive |
| delivery-mapa | Ámbar | permisos ubicación, errores, privacidad | device tests |
| asistente-ia | Ámbar | validación prompt/output, secretos, rate limit | abuse/security suite |
| soporte | Ámbar | C/R/U/D tickets, adjuntos, permisos | E2E CRUD |
| demo-control | Ámbar | aislamiento demo/producción | negative access tests |
| modulos-madurez | Ámbar | score no debe confundirse con QA real | cambiar semántica/evidencia |
| reglas-negocio | Ámbar | autorización y regresión | contract tests |
| licencias | Rojo/P0 comercial | expiración, módulos, tenant, bypass, clock | E2E allow/deny/expiry |
| importacion-data | Rojo/P0 datos | schema, CSV, duplicados, atomicidad, errores fila | import test matrix |
| kardex | Ámbar | reconciliación stock/movimientos | golden data |
| normativa-contable | Verde técnico | versionado/referencias | smoke + actualización |
| pretesting | Ámbar | score heurístico, no certificación | separar estimate vs evidence |
| salud | Ámbar | navegación vertical, permisos, PII | E2E vertical + privacy |
| veterinaria | Ámbar | mascotas/tutores/profesionales/citas/historia C/R/U/D; modal no descartar input; responsive | CRUD completo + dossier compacto |
| psicologia | Ámbar | pacientes/citas/notas, privacidad, calendario, recordatorios | E2E + privacy/integraciones |
| odontologia | Ámbar | pacientes/profesionales/odontograma/procedimientos/historia | CRUD + odontograma E2E |
| gimnasio | Ámbar | clientes/instructores/clases/membresías/check-in | E2E + import/export |
| rutinas | Ámbar | usuario test, generador, guardado/copia WhatsApp | tests deterministas de prescripción no clínica |
| nutricion | Ámbar | usuario test, sustituciones, FoodData, validación clínica | API contract + safety gates |
| mensajes | Ámbar | templates, envío/copia, permisos/PII | E2E + redaction |

## CRUD vertical — checklist mínimo por módulo

### Veterinaria
- **Create:** tutor, mascota, profesional, cita, evento/historia.
- **Read:** lista + expediente master/detail seleccionado.
- **Update:** ficha mascota/tutor, profesional, cita e historia corregible.
- **Delete:** registros permitidos con confirmación; históricos clínicos sensibles deben considerar soft-delete/audit en vez de borrado silencioso.
- **P0:** un modal no debe cerrarse al hacer click fuera si eso descarta datos escritos.

### Psicología
- Paciente, cita, sesión/nota y planificación deben tener ownership/tenant explícito.
- No exponer contenido sensible en logs, analytics ni notificaciones.
- Calendar/email/WhatsApp deben ser integraciones opcionales y auditables.

### Odontología
- Paciente/profesional/cita/procedimiento C/R/U/D.
- Odontograma 11–48: estado por pieza, cambios auditables y responsive táctil.
- Historia y procedimiento no deben perderse por cerrar accidentalmente modal.

### Gimnasio / Rutinas
- Cliente/instructor/clase/membresía/evaluación C/R/U/D.
- `Usuario test / sin registrar` habilita recomendación rápida pero **no** debe crear PII ficticia.
- Importación: plantilla versionada, validación por fila, preview antes de confirmar, reporte de errores, idempotencia.
- Exportación: datos del tenant actual exclusivamente.

### Nutrición
- Recomendaciones generales, no diagnóstico clínico automático.
- Cada fuente de proteína generada debe ofrecer **al menos dos sustituciones prácticas** cuando sea posible: por ejemplo pescado blanco → sardinas/atún → pollo; pavo → pollo → huevos/claras; legumbres → caraotas/garbanzos/soya.
- FoodData debe consumirse server-side; nunca exponer una key privada en el bundle.
- Embarazo, TCA, enfermedad renal/metabólica, medicación relevante o dieta terapéutica requieren gate y derivación profesional.

## Diseño / UX / responsive

### Problemas de arquitectura visual
1. La centralización CSS está iniciada, pero `erp-runtime.css` todavía importa varias capas históricas.
2. Cuando una capa legacy redefine el mismo selector después de un contrato moderno, reaparecen iconos dobles, sidebar oscuro en light y forms “doble rectángulo”.
3. Solución de transición: **una última capa de invariantes** y migración gradual a tokens/componentes, no más overrides aislados por pantalla.

### Breakpoints obligatorios de regresión

| Clase | Viewports mínimos |
|---|---|
| Teléfono compacto | 360×800 |
| Teléfono estándar | 390×844 |
| Teléfono ancho | 430×932 |
| Tablet vertical | 768×1024 |
| Tablet horizontal | 1024×768 |
| Laptop | 1366×768 |
| Desktop | 1440×900 |
| Desktop ancho | 1920×1080 |

Por viewport medir: `document.scrollWidth <= innerWidth`, header en una fila, drawer contenido, overlays dentro del viewport, controls >=44px táctiles, labels no solapados y tablas con estrategia explícita de scroll/reflow.

## Arquitectura

### Fortalezas
- Separación frontend/backend y amplio catálogo de servicios verticales.
- Entrada visual central `erp-runtime.css` y design contracts ya existentes.
- Backend con Helmet, CORS, CSRF, request-id, rate limits y guards de secrets.
- AuthSession con modelo HttpOnly evita persistir bearer tokens de alto privilegio en frontend.
- Control Hípico tiene una base offline-first propia: IndexedDB, outbox, snapshots y parser local en la RC recuperada.

### Deuda
- `app.js` y algunos shims concentran demasiada coordinación transversal.
- RBAC/licencia/sesión duplican decisiones; deben converger en una política única.
- Las capas CSS heredadas deben retirarse por lotes medibles.
- El runtime Hípico recuperado es un producto independiente dentro del mismo repositorio y requiere boundary explícito para no contaminar reglas contables.

## Seguridad

### Bien encaminado
- Headers de seguridad y CSP/reporting.
- Rate limits globales y específicos.
- CSRF en mutaciones web.
- Secrets de producción validados server-side.
- No usar service-role keys en frontend.

### Riesgos que deben seguir bloqueando release
1. bypass local de permisos que pueda escapar de QA a cliente comercial;
2. imports CSV sin límites/schema/atomicidad;
3. IA/agentes con tools sin validación estricta;
4. webhooks sin HMAC/replay/dedupe;
5. automatización monetaria de Hípico antes de conformance;
6. PII clínica en logs/telemetría;
7. service worker sirviendo HTML/assets antiguos después de deploy.

## FODA exhaustivo

### Fortalezas
- Cobertura funcional horizontal (contable/comercial) y vertical (salud/fitness).
- Potencial multi-PYME y profesional independiente.
- Base backend con controles de seguridad modernos.
- PWA y enfoque mobile-first en evolución.
- Hípico aporta experiencia offline/operativa especializada difícil de reemplazar con SaaS genérico.
- Catálogo de módulos permite licenciamiento modular.

### Oportunidades
- Convertir verticales en paquetes vendibles: Veterinaria, Psicología, Odontología, Fitness/Nutrición.
- Importadores/exportadores Excel/CSV para acelerar onboarding.
- Integraciones Calendar/email/WhatsApp como add-ons auditables.
- FoodData y bibliotecas propias de ejercicios como asistentes, no como dependencia UI de terceros.
- Observabilidad, contract testing y component library pueden reducir regresiones que hoy consumen tiempo.
- Control Hípico puede evolucionar shadow → assist → automatización limitada después de evidencia.

### Debilidades
- Regresiones repetidas en header/sidebar/forms demuestran ownership CSS todavía difuso.
- Cobertura E2E insuficiente para un ERP con tantas mutaciones.
- Demasiados módulos para mantener todos con la misma profundidad si no se estandarizan componentes/CRUD contracts.
- Score de “madurez” puede dar falsa seguridad.
- Acceso/licencia repartido entre varias capas.
- Parte de la UX todavía está orientada a formularios largos en vez de flujos rápidos/tareas.

### Amenazas
- Error contable o de inventario por transacción parcial/concurrencia.
- Exposición cross-tenant o clínica por autorización incorrecta.
- Prompt injection/supply-chain mediante skills, hooks o MCP de terceros.
- Automatización WhatsApp incorrecta con impacto monetario/reputacional.
- Cache PWA obsoleta aparentando que un fix “no funciona”.
- Cambios de APIs externas/cuotas o políticas de proveedores.
- Crecimiento del CSS/JS sin presupuestos de performance y ownership claros.

## Proyección a futuro

Como **ningún módulo está certificado 100% hoy**, no se asigna una proyección “100%-verified” ficticia por módulo. La proyección se condiciona al gate anterior:

### Familia contable/comercial — 12 a 36 meses
- **Tras certificación:** automatización de conciliaciones, cierres guiados, importaciones masivas, reportes consolidados multiempresa y auditoría trazable.
- **Condición:** invariantes contables golden-data, idempotencia y autorización por tenant antes de automatizar.

### Salud — 12 a 36 meses
- **Veterinaria:** expediente longitudinal, agenda/recordatorios, inventario clínico y analítica operacional.
- **Psicología:** agenda, confirmaciones y planificación; IA solo como asistencia administrativa/documental con privacidad estricta.
- **Odontología:** odontograma longitudinal, tratamientos/presupuestos y seguimiento.
- **Condición:** privacidad, audit trail y autorización granular demostrados.

### Fitness/Nutrición — 12 a 36 meses
- Biblioteca propia de ejercicios, planes reutilizables, hábitos, seguimiento y propuestas rápidas para usuario test.
- Nutrición basada en referencias alimentarias y sustituciones regionales, sin convertirse en prescripción clínica automática.
- **Condición:** safety gates + datasets/contract tests de generadores.

### Control Hípico — 12 a 36 meses
- PWA/APK con mismo contrato operacional, offline-first y restauración segura.
- WhatsApp: S2 shadow → S3 assist con aprobación → S4 automático no monetario → expansión solo si conformance demuestra precisión.
- **Condición:** paridad RC1 verificada, pruebas Android reales, Bridge soportado, HMAC/dedupe/idempotencia y settlement conformance.

## Definition of Done para declarar un módulo 100%

- [ ] Build y route smoke PASS.
- [ ] CRUD aplicable PASS con datos reales de test.
- [ ] Allow/deny por rol/licencia/tenant PASS.
- [ ] 8 viewports sin overlap/overflow PASS.
- [ ] teclado/foco/contraste/a11y PASS.
- [ ] API happy/negative/rate/error PASS.
- [ ] import/export/PWA/offline aplicable PASS.
- [ ] seguridad sin P0/P1 abierto.
- [ ] evidencia versionada y repetible.
- [ ] rollback documentado.

Hasta que esas casillas existan con evidencia, el estado correcto es **implementado/en QA**, no “100%”.
