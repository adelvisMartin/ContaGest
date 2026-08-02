# ContaGest-VE · Matriz de endurecimiento empresarial v11.12

Actualizada: 2026-08-02.

## Resultado de la fase

La versión 11.12 cierra la deuda técnica bloqueante identificada después de v11.11: el frontend carga las páginas bajo demanda, las dependencias quedan fijadas con lockfile, se elimina `@types/bcryptjs`, se retiran credenciales genéricas del JavaScript y se añaden controles server-side para acceso temporal y fuerza bruta.

Estados: **cerrado** significa implementado y verificable; **parcial** significa que existe una base funcional pero falta el alcance descrito; **externo** requiere proveedor, credencial o decisión de producto antes de implementarse.

## P0 · Salida a QA web

| Control | Estado | Evidencia v11.12 |
|---|---|---|
| TypeScript, pruebas y builds | Cerrado | CI con `npm ci`, typecheck, tests, frontend, backend y auditoría |
| Browser QA responsive | Cerrado | Playwright en workflow y verificación web de login/viewport |
| Login, CAPTCHA, licencia, MFA y roles | Cerrado | Auth firmada, CAPTCHA HMAC, licencia/dispositivo, tarjeta de coordenadas y RBAC |
| Preview Vercel sin 5xx | Cerrado | Health endpoint y revisión de runtime antes de promover |
| Reversión | Cerrado | Cambios publicados por rama/PR; producción conserva deployment anterior |

## P1 · Seguridad

| Punto | Estado | Aplicado / siguiente alcance |
|---|---|---|
| Credenciales demo publicadas | Cerrado | Eliminado `demo1234` de auth, RBAC y estado frontend; usuarios sin hash no autentican |
| Acceso temporal revocable | Cerrado | `UserProfile.accessExpiresAt` se comprueba en login, MFA, refresh, JWT backend y Supabase |
| Antifuerza bruta centralizada | Cerrado | Intentos fallidos compartidos en Postgres, 5 intentos/15 min, limpieza y RLS sin acceso público |
| CSP y dependencias frontend | Cerrado | Sin `unsafe-eval`, esm.sh, unpkg de QR ni jsPDF global; scanner instalado localmente |
| Endpoints RBAC administrativos | Cerrado | Todo el router RBAC exige tenant firmado y `admin.manage` |
| Sesiones/dispositivos visibles y revocación individual | Parcial | Dispositivos de licencia son revocables; falta inventario de JWT por sesión con `jti` |
| Recuperación de contraseña/verificación de correo | Externo | Requiere proveedor transaccional y política de identidad/correo |
| Alertas de acceso anómalo | Parcial | AuditLog y registro de intentos existen; falta canal de alertas y reglas configurables |

## P1 · Persistencia y procesos

| Punto | Estado | Aplicado / siguiente alcance |
|---|---|---|
| Tareas, bancos, nómina y analítica server-side | Parcial | APIs/tablas existen; quedan vistas y operaciones históricas que aún usan Store |
| Ventas/compras/inventario/clientes | Parcial | Persistencia autoritativa y validación existen; ampliar versionado optimista por entidad |
| Soft delete y trazabilidad legal | Parcial | AuditLog/reversos existen en flujos críticos; homogeneizar archivado en CRUD restante |
| Aprobaciones por rol | Parcial | Nómina/cierres tienen estados; falta motor común de aprobaciones |
| Bloqueo contable y reversos | Parcial | Periodos y reversos formales existen en contabilidad/compras; completar cobertura transversal |

## P1 · Verticales

| Vertical | Estado | Pendiente real |
|---|---|---|
| Veterinaria/salud | Parcial | Facturación automática de cargos, firma/adenda clínica, DICOM, portal y recordatorios programados |
| Gimnasio | Parcial | Persistencia base disponible; pagos recurrentes, lista de espera, PAR-Q y renovaciones requieren reglas/proveedor |
| Delivery/tracking | Parcial | Estados, ETA y prueba de entrega existen; optimización de rutas y mensajería dependen de proveedor |

## P2 · Rendimiento y mantenimiento

| Punto | Estado | Evidencia v11.12 |
|---|---|---|
| Lockfile y `npm ci` | Cerrado | `package-lock.json` v3, versiones exactas y workflows reproducibles |
| Bundle de 1.34 MB | Cerrado | `import.meta.glob` por página, entry de 137.5 KiB y presupuesto CI de 700 KiB/chunk |
| `@types/bcryptjs` obsoleto | Cerrado | Retirado; bcryptjs 3 incluye tipos |
| Claves foráneas sin índice | Cerrado | 27 índices FK añadidos; no se eliminan índices “unused” sin telemetría suficiente |
| Prisma 7 | Pendiente | Mantener Prisma 6.19.3; migrar a `prisma.config.ts` en una fase aislada |
| Paginación/caché/invalidation | Parcial | Disponible por módulo; falta estándar único para todos los listados |

## P2 · UX, accesibilidad, analítica e IA

| Punto | Estado | Pendiente real |
|---|---|---|
| Estados comunes y tablas | Parcial | Componentes comunes existen; migración de pantallas heredadas continúa |
| WCAG AA y teclado | Parcial | Login y shell cubiertos; falta auditoría exhaustiva de todos los temas/módulos |
| Métricas/cohortes/reportes programados | Parcial | Analítica y eventos existen; envíos requieren correo transaccional |
| IA con herramientas y aprobaciones | Parcial | Endpoint/permiso existen; faltan evaluación formal, citas y políticas por herramienta |
| Streaming/cancelación | Pendiente | Implementar junto al contrato definitivo del proveedor/modelo |

## Límites deliberados

No se marcan como “cerradas” integraciones que requieren cuentas externas, tarifas o decisiones comerciales: correo transaccional, pagos recurrentes, WhatsApp, mapas premium, DICOM y proveedor de IA. La base permanece preparada, pero esas funciones deben configurarse con credenciales propias y criterios de aceptación específicos.

## Criterio de promoción

- CI y browser QA verdes.
- Ningún chunk JavaScript supera 700 KiB y el total no supera 3.5 MiB.
- Auditoría de dependencias de producción sin vulnerabilidades altas.
- Login temporal expira en servidor y el bloqueo de intentos funciona entre instancias.
- Supabase Security Advisor sin errores y RLS sin acceso público a intentos de autenticación.
- Preview Vercel sin errores de runtime ni respuestas 5xx.
