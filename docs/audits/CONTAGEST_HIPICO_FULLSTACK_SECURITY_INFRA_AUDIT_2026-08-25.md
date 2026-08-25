# ContaGest VE + Control Hípico — Auditoría Full Stack, Seguridad e Infraestructura

**Fecha:** 2026-08-25  
**Rama:** `feat/contagest-hipico-security-infra-hardening`  
**Base:** `main`  
**Alcance:** ContaGest VE y Control Hípico como productos independientes que actualmente comparten repositorio y parte de la infraestructura.

## Principio de certificación

Esta auditoría no considera un producto o módulo “100% terminado” porque compile, tenga una interfaz atractiva o posea tests aislados. La certificación exige evidencia repetible de funcionalidad, autorización, aislamiento de datos, accesibilidad, responsive, seguridad, rendimiento, persistencia, recuperación y operación real.

## Resumen ejecutivo

| Área | ContaGest VE | Control Hípico | Lectura |
|---|---:|---:|---|
| UX/UI y diseño | 7.8/10 | 7.7/10 | Base visual madura, aún con deuda de consistencia y composición |
| Frontend | 6.9/10 | 6.6/10 | Funcional y amplio, pero ambos runtimes centrales son demasiado monolíticos |
| Backend / dominio | 8.0/10 | 8.4/10 | Buen endurecimiento; Hípico destaca por shadow/manual gates |
| Seguridad | 7.8/10 | 7.5/10 | Bastante superior a un MVP, pero existen riesgos de autorización y operación que deben cerrarse |
| Infraestructura / DevOps | 7.3/10 | 8.0/10 | CI y worker Hípico sólidos; falta fortalecer integración real, observabilidad y aislamiento |
| QA / verificabilidad | 8.2/10 | 8.0/10 | Gran superficie de gates, pero aún no equivale a certificación E2E completa |

**Conclusión:** ninguno de los dos productos está incompleto en sentido de MVP, pero tampoco debe considerarse “cerrado”. Ambos se encuentran en una fase avanzada de endurecimiento y profesionalización. El objetivo de esta rama es elevar seguridad e infraestructura sin mezclar el rediseño visual, que debe permanecer en una rama separada.

## Arquitectura de trabajo por ramas

### UX/UI + frontend visual

Rama: `feat/unified-ux-shadcn-coss-baseweb-root`

Debe concentrar design system, componentes, composición, responsive, accesibilidad, microinteracciones, refactor visual, reducción de CSS heredado y modularización de los shells frontend.

### Seguridad + backend + infraestructura

Rama: `feat/contagest-hipico-security-infra-hardening`

Debe concentrar autenticación, autorización, gestión de secretos, RLS/RPC, aislamiento multi-tenant, límites, auditoría, observabilidad, CI con infraestructura real, health/readiness, backups, despliegue, supply chain y hardening del Bridge.

No se deben mezclar cambios puramente cosméticos en esta rama salvo cuando sean necesarios para seguridad o accesibilidad.

---

# 1. ContaGest VE — UX/UI y diseño web

## Fortalezas

- Existe una entrada CSS canónica y propietarios visuales definidos.
- Hay tokens semánticos y contratos para shell, primitives, módulos y apariencia.
- La QA actual ya mide overflow, composición, contraste y múltiples viewports.
- La aplicación dispone de rutas especializadas y layouts por dominio.
- La navegación, temas, tablas, formularios y estados están bastante más normalizados que en una aplicación típica de primera versión.

## Deuda

### CG-UX-001 — Arquitectura visual todavía depende de adaptadores amplios

`module-adapters.css` y otras capas siguen concentrando geometría específica de numerosos dominios. Esto funciona, pero incrementa el riesgo de regresión transversal cuando una regla cambia.

**Objetivo:** mover patrones repetidos a componentes/primitives reutilizables y dejar los adapters únicamente para geometría realmente exclusiva del dominio.

### CG-UX-002 — Reparación visual posterior al render

El runtime añade clases, inspecciona tablas y normaliza nodos después de que cada pantalla ha renderizado. Es útil como transición, pero no debe convertirse en el contrato definitivo.

**Objetivo:** cada componente debe nacer con su contrato visual correcto; el shell no debería “reparar” la página después del render salvo telemetría o compatibilidad temporal.

### CG-UX-003 — Sistema mixto DOM + React

El shell principal conserva bastante manipulación DOM manual mientras algunas pantallas son React-managed. Esto hace más costoso razonar sobre ciclo de vida, estado, limpieza de eventos y accesibilidad.

**Objetivo:** migración incremental, no reescritura total. Shell, navegación, overlays y componentes compartidos deben converger a una arquitectura declarativa.

### CG-UX-004 — Densidad y jerarquía

ContaGest es un ERP y necesita alta densidad informativa, pero no debe parecer comprimido o lleno de cajas. Debe priorizar:

- una jerarquía de títulos coherente;
- un sistema de spacing único;
- menos tarjetas anidadas;
- barras de acciones estables;
- tablas con sticky headers y densidad configurable;
- formularios con agrupación semántica;
- estados vacíos y errores orientados a la acción;
- keyboard/focus completos.

---

# 2. ContaGest VE — Frontend

## Fortalezas

- Lazy loading por módulos.
- Catálogo amplio de rutas.
- Separación de servicios para auth, analítica, URL, sync y acceso.
- Contratos QA sobre 58 rutas.
- Bundle budget y auditorías de funciones/visual.

## Riesgos de mantenibilidad

### CG-FE-001 — `frontend/src/app.js` actúa como “god orchestrator”

Actualmente concentra bootstrap, autorización visual, router, shell, eventos globales, navegación, normalización de DOM, sidebar, command palette, menú de usuario y ciclo de render.

**Severidad:** Alta por deuda técnica, no por vulnerabilidad inmediata.

**Remediación:** separar progresivamente en:

- `app/bootstrap`;
- `routing`;
- `session`;
- `shell-controller`;
- `navigation`;
- `command-palette`;
- `user-menu`;
- `visual-invariants`;
- `page-registry`.

### CG-FE-002 — Autorización frontend con monkey patch

La UI modifica `AccessControlService.canAccessRoute` en runtime para sumar reglas de licencia/QA. Aunque el backend siga siendo autoridad, esta composición es difícil de auditar.

**Objetivo:** una sola función pura de “visibilidad de UI”, alimentada por un DTO explícito del backend. Nunca recalcular permisos de negocio en el cliente.

### CG-FE-003 — Observabilidad de rendimiento frontend

Falta convertir métricas como LCP, INP, CLS, tamaño de chunks, tiempo de render y errores por ruta en un gate observable.

**Objetivo:** budgets por shell y pantallas críticas, no solo peso total del bundle.

---

# 3. ContaGest VE — Backend

## Fortalezas

- Express 5 + TypeScript.
- Prisma/PostgreSQL.
- RBAC y tenant explícitos.
- Cookies HttpOnly para sesión de navegador.
- access token corto y refresh rotatorio.
- CSRF, CORS, Helmet y cabeceras de seguridad.
- rate limits globales, de mutación, auth y operaciones costosas.
- validación con Zod.
- auditoría y pruebas de persistencia/finanzas disponibles.

## Hallazgos prioritarios

### CG-SEC-001 — Bloqueo permanente de cuenta explotable como DoS

**Severidad: Alta.**

El flujo de login cuenta fallos por empresa/email y, al alcanzar cinco, cambia `UserProfile.status` a `disabled`. Un tercero que conozca RIF y correo puede provocar el bloqueo permanente de una cuenta sin conocer la contraseña.

**Remediación obligatoria:**

- no mutar el estado administrativo del usuario por fallos de contraseña;
- aplicar cooldown temporal/progresivo;
- mantener rate limit por IP/dispositivo/identidad;
- CAPTCHA adaptativo;
- respuesta genérica sin mostrar cuántos intentos faltan;
- desbloqueo automático una vez cumplido el cooldown;
- registrar el evento para auditoría.

### CG-SEC-002 — Separación de secretos insuficiente en fallback

**Severidad: Alta.**

La configuración puede derivar JWT/license secrets a partir de credenciales de base de datos, Supabase service role u otros secretos. Aunque producción comercial exige secretos explícitos, esta estrategia acopla dominios criptográficos que deberían ser independientes.

**Remediación:**

- `JWT_SECRET` y `LICENSE_HASH_SECRET` independientes;
- ninguna derivación desde DB/service-role en producción;
- previews con secretos efímeros solo mediante opt-in explícito;
- rotación documentada y testeada;
- key versioning si existen licencias persistentes.

### CG-INFRA-003 — Liveness y readiness no están diferenciados

**Severidad: Alta operativa.**

Los endpoints de health actuales pueden devolver “healthy” antes de verificar que la configuración criptográfica de producción esté lista. Un balanceador podría considerar sana una instancia que después devuelve 503 en APIs protegidas.

**Remediación:**

- `/health/live`: proceso vivo, sin DB;
- `/health/ready`: secretos válidos + conectividad DB + migraciones/schema compatibles;
- 503 cuando no esté listo;
- no exponer secretos ni detalles internos en payloads públicos.

### CG-SEC-004 — Guard de patrones sospechosos es solo defensa secundaria

El blacklist de URL/query ayuda frente a ruido automatizado, pero no debe considerarse un WAF ni reemplazar consultas parametrizadas y validación semántica. Puede además generar falsos positivos.

**Remediación:** mantenerlo como telemetría/defensa secundaria y asegurar que los controles reales sean Zod, Prisma/SQL parametrizado, autorización y límites de recursos.

### CG-BE-005 — Transacciones e idempotencia deben ser gates por flujo crítico

Ventas, inventario, POS, cierres, bancos, nómina e importaciones necesitan demostrar atomicidad e idempotencia bajo reintentos/concurrencia.

**Objetivo:** casos de fallo real que prueben rollback, duplicate request, timeout y replay.

---

# 4. ContaGest VE — Seguridad

## Ya está bien encaminado

- Access/refresh separados.
- Cookies `__Host-*` en producción.
- HttpOnly + Secure.
- Refresh rotation y detección de reuse/concurrencia.
- CSRF asociado a sesión.
- issuer/audience JWT fijos.
- access token de 15 minutos.
- CORS allowlist.
- headers de seguridad.
- CSP/reporting.
- controles de registro y tenant.
- rate limits por categoría.

## Por cerrar

### CG-SEC-006 — CSP frontend todavía permite `unsafe-inline`

Debe reducirse progresivamente con nonce/hash o eliminación de estilos inline. También conviene self-hosting de tipografías/iconos para reducir dependencias externas y endurecer CSP.

### CG-SEC-007 — Credenciales demo/locales visibles

El seed protege producción, pero el README publica credenciales locales conocidas. El riesgo principal es un entorno accesible que accidentalmente se ejecute como development/test.

**Remediación:** generar contraseña aleatoria local o exigir `SEED_ADMIN_PASSWORD` en cualquier entorno no estrictamente localhost; nunca desplegar el tenant demo por defecto.

### CG-SEC-008 — Supply chain

Workflows referencian Actions por tag mayor. Se recomienda pin SHA inmutable y proceso automático de actualización/renovación.

---

# 5. ContaGest VE — Infraestructura / CI-CD

## Fortalezas

- CI de TypeScript/tests/build/bundle/audit.
- Playwright Chromium + WebKit.
- artifacts de QA.
- production dependency audit.
- gates visuales y funcionales propios.

## Hallazgos

### CG-INFRA-001 — CI principal no demuestra PostgreSQL real

El workflow configura URLs localhost, pero no levanta un servicio PostgreSQL en ese job. Existen scripts de persistencia y finanzas reales en el repositorio, pero no están integrados como gate obligatorio de CI principal.

**Remediación:** job PostgreSQL 16/17 con healthcheck, migrations, seed mínimo y suites de persistencia/finanzas.

### CG-INFRA-002 — Falta un gate de migraciones

Cada PR con cambios Prisma/SQL debe comprobar:

- migración limpia desde cero;
- upgrade desde versión anterior soportada;
- rollback lógico/documentado;
- RLS reaplicada;
- no pérdida destructiva accidental.

### CG-INFRA-003 — Observabilidad

Agregar:

- logs estructurados con request ID;
- errores centralizados;
- métricas HTTP y latencias por endpoint;
- DB pool saturation;
- rate-limit hits;
- auth failures sin PII sensible;
- SLO/alertas;
- CSP telemetry centralizada.

### CG-INFRA-004 — Backups y recuperación

Un producto contable necesita un RPO/RTO explícito. No basta con que Supabase tenga mecanismos de backup: el proyecto debe probar restauración y documentar evidencia.

---

# 6. Control Hípico — UX/UI y diseño

## Fortalezas

- Producto separado visualmente de ContaGest.
- Mobile-first.
- Offline/PWA.
- Tokens, temas y stylesheet operativo propios.
- Contexto de grupo/carrera y flujo centrado en la operación real.
- Recuperación, backups, snapshots y outbox visibles.

## Deuda

### HIP-UX-001 — `app.js` demasiado grande

El frontend de Hípico combina navegación, render HTML, workspace, carreras, participantes, calendario, chat, sync, reportes, operaciones y estado global en un único runtime grande.

**Objetivo:** separar por dominios/pantallas sin perder offline-first.

### HIP-UX-002 — Global mutable state

Variables globales para workspace, view, modal, timers, sync, shadow feed y chat aumentan el riesgo de estados imposibles.

**Objetivo:** store explícito + state machine para jornada/carrera/sync y renders deterministas.

### HIP-UX-003 — Acabado comercial

La aplicación ya es funcional, pero debe pasar una última capa de producto profesional:

- identidad y textos sin referencias personales en splash;
- componentes táctiles coherentes;
- tablas/listas adaptadas a móvil;
- jerarquía de decisiones críticas;
- confirmaciones para operaciones irreversibles;
- accesibilidad sistemática;
- navegación física/back de Android coherente;
- dark/light revisados pantalla por pantalla.

---

# 7. Control Hípico — Seguridad

## Fortalezas

- Fuente WhatsApp oficial tratada como solo lectura.
- LAB separado como único destino de simulación.
- operaciones monetarias/resultados/cierres siguen shadow/manual.
- Bridge con token independiente.
- endpoint webhook con firma.
- idempotencia y spool.
- PWA evita cachear rutas sensibles.
- local auth usa PBKDF2-SHA256 y salt aleatorio.
- signup cloud deshabilitado por defecto.

## Hallazgos prioritarios

### HIP-SEC-001 — `user_metadata.role` no debe ser autoridad

**Severidad: Alta si el rol influye en privilegios.**

El cliente puede leer el rol desde `app_metadata` o `user_metadata`. En Supabase, `user_metadata` es información modificable por el usuario y nunca debe decidir privilegios.

**Remediación:**

- autoridad solo desde claims protegidos (`app_metadata`) o tabla/RPC server-authoritative;
- UI puede mostrar un rol, pero RLS/RPC debe revalidar siempre;
- test negativo: usuario modifica metadata y no obtiene ninguna capacidad adicional.

### HIP-SEC-002 — Fallback RPC → acceso REST directo debe fallar cerrado en producción

**Severidad: Alta.**

Cuando un RPC no existe, el frontend cae a consultas/upserts directos a tablas. Esto hace que toda la seguridad dependa de RLS perfecta y puede saltarse validaciones de negocio que vivan en RPC.

**Remediación:**

- en producción, RPC obligatorio para writes sensibles;
- direct-table fallback solo en desarrollo/LAB mediante flag explícito;
- pruebas RLS por propietario y por rol;
- negar por defecto si el RPC no está desplegado.

### HIP-SEC-003 — Sesión cloud persistente en dispositivo

Debe verificarse exactamente cómo `saveCloudSession` persiste refresh/access tokens. Si se guarda en IndexedDB/local storage, el principal riesgo es XSS o acceso físico al perfil del dispositivo.

**Remediación:**

- minimizar vida/alcance del token;
- Content Security Policy estricta;
- no introducir scripts de terceros;
- considerar envoltura cifrada vinculada al secreto local si el threat model lo justifica;
- limpiar sesión al desregistrar dispositivo.

### HIP-SEC-004 — IndexedDB no equivale a cifrado at-rest

PBKDF2 protege la verificación del acceso offline, pero los datos de negocio en IndexedDB no quedan automáticamente cifrados por esa contraseña.

**Remediación:** valorar cifrado de campos/snapshots sensibles con WebCrypto y una clave derivada, especialmente si el APK se usará en dispositivos compartidos.

### HIP-SEC-005 — Bridge WhatsApp Web no oficial

Es una dependencia operativa deliberada y desacoplada, pero debe tratarse como integración de riesgo:

- cuenta dedicada;
- mínimo privilegio;
- source read-only por código y tests;
- kill switch;
- rate caps;
- aislamiento de filesystem;
- sesión protegida;
- backups controlados;
- alertas de desconexión y anomalías;
- procedimiento de rotación/revinculación.

---

# 8. Control Hípico — Infraestructura

## Fortalezas

El servicio Linux del Bridge está considerablemente endurecido:

- usuario y grupo dedicados;
- no root;
- filesystem protegido;
- `NoNewPrivileges`;
- capabilities vacías;
- `UMask=0077`;
- estado 0700;
- límites de memoria/CPU/tasks;
- journald;
- reinicio controlado;
- healthcheck separado.

## Por cerrar

### HIP-INFRA-001 — Separación física de productos

Aunque la frontera lógica existe, ContaGest y Hípico aún comparten repositorio y parte del backend/DB. A medida que ambos crezcan se recomienda una frontera de despliegue explícita:

- proyectos Vercel separados;
- variables de entorno separadas;
- service roles separados cuando sea posible;
- esquema/RLS claramente aislado;
- pipelines independientes;
- releases Android independientes;
- rollback independiente.

No es obligatorio separar repositorios inmediatamente si el monorepo sigue siendo administrable.

### HIP-INFRA-002 — APK release

No certificar Android producción hasta completar:

- firma release fuera del repositorio;
- Play Integrity/controles aplicables;
- pruebas físicas;
- upgrade desde versión anterior sin pérdida local;
- backup/restore;
- offline prolongado;
- reconexión/sync conflict;
- comportamiento del botón Atrás;
- deep links y recovery.

### HIP-INFRA-003 — Observabilidad del Bridge

Agregar métricas además del healthcheck:

- conectado/desconectado;
- último mensaje fuente;
- backlog spool;
- reintentos;
- dedupe;
- latencia backend;
- errores de group identity;
- envíos LAB;
- cero envíos source como invariante monitorizada.

---

# 9. Backlog por prioridad

## P0 — antes de certificar producción comercial

1. Eliminar el bloqueo permanente explotable del login de ContaGest.
2. Fail-closed del rol Hípico: nunca `user_metadata` como autoridad.
3. Fail-closed RPC Hípico para writes/lecturas sensibles; fallback directo solo LAB/dev explícito.
4. Readiness real de backend con secretos + DB.
5. CI con PostgreSQL real y pruebas de persistencia/finanzas.
6. Validación E2E RBAC/multi-tenant con allow + deny en ContaGest.
7. Validación RLS real por propietario/rol en Hípico.
8. Backup/restore probado y documentado.
9. Mantener automatización monetaria Hípico deshabilitada hasta conformance suficiente.

## P1 — hardening y escalabilidad

1. Separar secretos criptográficos y rotación.
2. Pin SHA de GitHub Actions.
3. Observabilidad central y SLO.
4. Migraciones con upgrade tests.
5. Refactor progresivo de los dos `app.js` monolíticos.
6. CSP más estricta y reducción de terceros frontend.
7. Cifrado local opcional de Hípico según threat model.
8. Separación de despliegues ContaGest/Hípico.

## P2 — excelencia operativa

1. Performance budgets por ruta.
2. Pruebas de carga y concurrencia.
3. chaos/recovery tests de servicios externos.
4. DR drill periódico.
5. SBOM/provenance y firma de artifacts/releases.
6. visual regression estable para pantallas críticas de ambos productos.

---

# 10. Definition of Done objetivo

Un release solo se marcará **Production Ready** cuando:

- build/typecheck/tests estén verdes;
- dependency audit no tenga high/critical sin excepción documentada;
- RBAC/RLS negativos estén probados;
- CRUD y flujos críticos usen persistencia real;
- no haya hallazgos P0 abiertos;
- mobile/tablet/desktop cumplan layout y WCAG 2.2 AA aplicable;
- liveness/readiness representen el estado real;
- backups y restauración estén probados;
- logs/alertas permitan diagnosticar fallos;
- secretos no estén en repositorio/cliente salvo claves expresamente públicas;
- los productos puedan revertirse sin pérdida de datos;
- Hípico conserve los gates humanos para dinero/resultados/cierres hasta una promoción explícita y auditada.

## Resultado de esta auditoría

La base es buena y, particularmente en sesiones, QA y el Bridge Hípico, ya contiene mecanismos que normalmente aparecen mucho más tarde en un producto. La siguiente fase no debe sumar más parches. Debe reducir complejidad, cerrar los pocos riesgos de autorización/operación de alto impacto y transformar los gates existentes en evidencia de producción reproducible.
