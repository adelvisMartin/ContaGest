# ContaGest v11.15 — Registro de riesgos de seguridad y operación

Estado de esta rama; “implementado” no significa “liberado a producción” hasta completar QA/release.

| ID | Riesgo | Sev. | Estado v11.15 | Evidencia/Control | Gate restante |
|---|---|---:|---|---|---|
| SEC-001 | Acceso PostgREST innecesario a tablas ContaGest | Alta | Corregido en entorno de pruebas | grants directos `anon/authenticated` retirados previamente para tablas ContaGest; RLS tenant | no reabrir grants al migrar |
| SEC-002 | JWT en localStorage | Alta | Implementado en rama | `AuthSession` elimina token; cookies `HttpOnly` access/refresh | E2E HTTPS real |
| SEC-003 | Robo/reutilización de refresh | Alta | Implementado en rama | refresh opaco hasheado, rotación CAS, CSRF ligado a UserSession, revocación por `sid` | test de replay concurrente backend real |
| SEC-004 | CSRF en sesión cookie | Alta | Implementado en rama | SameSite + double submit + hash de CSRF en sesión + Fetch Metadata | E2E cross-site negativo |
| SEC-005 | Hash de licencia con secretos distintos | Alta | Corregido | `hashLicenseKey` canónico con `LICENSE_HASH_SECRET` | test generación→login con secretos diferentes |
| SEC-006 | `deviceId` clonable | Media/Alta | Mitigado materialmente | primera activación emite `cgdc_*`; solo hash en DB; cookie HttpOnly Strict; key+deviceId clonado no reemite si ya activado | considerar Passkeys/WebAuthn para clientes de mayor riesgo |
| SEC-007 | `$queryRawUnsafe/$executeRawUnsafe` en licencias | Media | Corregido | SQL parametrizado/tagged en guard/rutas nuevas | prohibir reintroducción por review/static rule |
| SEC-008 | Suscripción suspendida pero licencia técnica activa | Alta comercial | Corregido en rama | `assertSubscriptionAccess` en activación + middleware global cliente | E2E suspensión/reactivación |
| SEC-009 | Reusar una suscripción en RIF no pagado | Alta comercial | Corregido DB | `SubscriptionTenant` + trigger `enforce_license_subscription_tenant` | prueba ya ejecutada en DB; conservar regresión |
| SEC-010 | Exceder empresas contratadas | Alta comercial | Corregido DB | trigger `enforce_subscription_tenant_limit` | prueba ya ejecutada en DB |
| SEC-011 | Exceder usuarios contratados usando varias empresas | Alta comercial | Corregido DB | trigger cuenta emails distintos; mismo AccountUser multi-RIF = 1 usuario | prueba DB ejecutada |
| SEC-012 | Sesión revocada sigue válida hasta exp JWT | Media/Alta | Corregido | cada cookie JWT lleva `sid`; middleware valida `UserSession` activa | carga/perf con tráfico real |
| SEC-013 | Dispositivos sin administración granular | Media | Corregido en rama | API tenant-scoped + UI listar/revocar activación | Browser/API E2E |
| SEC-014 | Runtime DB con credencial propietaria | Alta | Preparado, no activado en Supabase compartido | `DATABASE_RUNTIME_URL`; self-host crea `contagest_app` no-superuser | activar solo en producción dedicada |
| SEC-015 | Supabase compartido con Hípico/Budget Wallet | Media/Alta | Aceptado temporalmente | frontera explícita: no tocar otras tablas; ContaGest se separará al existir contrato financiado | migración dedicada en Gate 1 |
| SEC-016 | Sin backup productivo automático en entorno gratis | Alta prod | No usar free como producción comercial | self-host scripts pg_dump cifrado + offsite + restore drill | configurar y probar antes de datos reales |
| SEC-017 | Ransomware destruye DB y backup local | Alta | Diseño preparado | cifrado `age`, rclone a proveedor externo, recomendación immutability/Object Lock | contratar/configurar offsite y restore mensual |
| SEC-018 | Supabase leaked-password protection desactivado | Media | No modificado por frontera compartida | ContaGest usa auth bcrypt propio y `SUPABASE_AUTH_FALLBACK=false` | habilitar/revisar antes de usar Supabase Auth en ContaGest; coordinar impacto otros proyectos |
| SEC-019 | Dependencias transitorias antiguas | Media | Proceso mejorado | CI audit + Dependabot semanal minor/patch; majors manuales | revisar PRs y SBOM/release audit |
| SEC-020 | Claims de seguridad/fiscal no verificables | Comercial/Legal | Corregido en guía | registro de claims + BrandGuidelines revisado | revisión marketing/legal por release |
| SEC-021 | Datos médicos/financieros reales sin controles contractuales | Alta | Gate de producto | no declarar vertical = compliance; privacidad/retención/roles/backups antes de operación | revisión legal/domain por país/cliente |

## Pruebas de base ejecutadas en el proyecto compartido de pruebas

- `maxTenants=1`: primer RIF aceptado, segundo RIF rechazado por `subscription_tenant_limit_reached`; datos temporales eliminados.
- Suscripción habilitada para RIF A: LicenseKey intentando usarla en RIF B rechazada por `subscription_not_entitled_for_tenant`; datos temporales eliminados.
- `maxUsers=1`: el mismo correo pudo existir en dos RIF contratados; un segundo correo distinto fue rechazado por `subscription_user_limit_reached`; datos temporales eliminados.

## Regla de producción

No usar “corregido en rama” como sinónimo de “seguro para producción”. El release requiere:
- CI/Static/Browser verdes;
- E2E con backend/PostgreSQL real;
- HTTPS/cookies reales;
- backup externo + restore exitoso;
- verificación de secretos, CORS, dominio y rol runtime;
- smoke de multiempresa y aislamiento cruzado.
