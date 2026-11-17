# Security verification matrix · ContaGest + Control Hípico · 2026-11-17
<!-- CG_SECURITY_MATRIX_20261117 -->

**Estado:** PLAN / GAP DISCOVERY. El inventario de tickets se revisó en `main@03834a6ca1504399011f4b53866fe15b8cfa2557`. No se reivindica certificación OWASP, auditoría externa, pruebas completas ni producción. Primero reproducir con SHA y entornos aislados; sin hallazgo demostrable no registrar falsa vulnerabilidad.

## Owners exclusivos y relaciones
| Owner | Producto | Frontera de responsabilidad (no duplicar) | Prueba de salida obligatoria |
|---|---|---|---|
| [#1312](https://github.com/adelvisMartin/ContaGest/issues/1312) | ContaGest | Sesión/refresh/revocación/CSRF/step-up privilegiado | revocación servidor, sesión robada, token replay, recuperación |
| [#1313](https://github.com/adelvisMartin/ContaGest/issues/1313) | ContaGest | Validaciones adversariales de file import/upload/export | CSV formula, MIME, size, path, cross-tenant, rechazo seguro |
| [#1288](https://github.com/adelvisMartin/ContaGest/issues/1288) | ContaGest | Matriz transversal de BOLA/BFLA/BOPLA API/jobs/cache/export | tenant A↔B/roles/403-404 sin fuga ni conteos |
| [#1289](https://github.com/adelvisMartin/ContaGest/issues/1289) | ContaGest | Abuso financiero/idempotencia/privilegios | concurrencia/replay, period close, ledger/inmutable |
| [#1290](https://github.com/adelvisMartin/ContaGest/issues/1290) | ContaGest | Detección y respuesta incidentes | tabletop secreto expuesto y rollback/revocation con evidencias |
| [#651](https://github.com/adelvisMartin/ContaGest/issues/651) | ContaGest | Convergencia de hallazgos conocidos | prueba regresión de cada hallazgo, no cerrar por mera mitigación escrita |
| [#720](https://github.com/adelvisMartin/ContaGest/issues/720) | ContaGest | Roles/policies de BD en producción | RLS/policies con IAM separado, evidencia exact SHA y reversión |
| [#1291](https://github.com/adelvisMartin/ContaGest/issues/1291) | Hípico LAB | Inyección/prompts/sender spoof/unsafe outputs | corpus adversarial, parser/outbox seguros, SOURCE bloqueado |
| [#1292](https://github.com/adelvisMartin/ContaGest/issues/1292) | Hípico PWA/APK | Cache, logout, cambio owner, revocación en dispositivo | upgrade, logout, offline/cache A/B, permisos Android reales |
| [#1314](https://github.com/adelvisMartin/ContaGest/issues/1314) | Hípico | Datos por grupo y privacy/retention/log redaction | inventario reales, retención, tenant/group denies, no borrar ledger |
| [#1018](https://github.com/adelvisMartin/ContaGest/issues/1018) | Hípico | Share links/public views | URL tokens redacted, key expiry, RLS, links OFF hasta gate |
| [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011) | Hípico | Política/permiso de canal WhatsApp SOURCE | fail-closed *antes* de browser/DOM/QR/network; LAB únicamente |
| [#842](https://github.com/adelvisMartin/ContaGest/issues/842) | Hípico | role backup/DR/restore | restore efímero y scopes autorizados, nunca en prod compartida |
| [#119](https://github.com/adelvisMartin/ContaGest/issues/119), [#120](https://github.com/adelvisMartin/ContaGest/issues/120) | Hípico | físico y soak 24–72h | evidencia hardware y 24h reales, no simulación instantánea |
| [#840](https://github.com/adelvisMartin/ContaGest/issues/840) | Ambos | deployment y rollback sin proveedor ficticio | SHA servido/health/build + smoke + reversible y provider state |

## Tabla de pruebas negativas por superficie
| Actor / input | Camino | Negativa necesaria | No-regresión |
|---|---|---|---|
| Tenant B usando ID del tenant A | API read/write/search/export/attachment/cache/background | 403/404 apropiado sin existencia/PII en respuesta, contador ni logs | acceso legítimo A y B preservado |
| Admin de A con permiso administrativo | jobs/ledger/clinical/exports B | tenant predicate obligatorio, sin bypass por rol global | auditoría del intent fallido |
| Sesión revocada/cookie robada | protected action + refresh | deny/revoke, sin nueva elevación, CSRF medido si cookie auth | sesión legítima funciona |
| Replay/concurrencia de mutaciones | emit/post/reverse/checkin/booking | idempotencia tenant-scoped, serialización, count único y ledger conciliado | retry sin doble efecto |
| Archivo controlado por atacante | import/preview/CSV export | validación formatos y cuotas, no ejecución de fórmulas/URLs peligrosas | descargas válidas compatibles |
| Mensaje LAB con prompt/código malicioso | parser/Conversation Engine/outbox | datos no reciben permisos de herramientas/red/sesión | respuesta LAB segura, orden/dedupe |
| WhatsApp Messenger SOURCE | bridge/inbox/spool/startup | no automatizar read/write ni eludir política por flags/DOM | operación permitida en LAB no rompe |
| Cambio user/group en Android offline | SW/IndexedDB/Cache Storage/storage | datos de usuario/grupo anterior inaccesibles; logout limpia caché autorizada | modo offline legítimo no pierde datos |
| Recuperación DR/permisos DB | migrations, role grants, backup, restore | no tocar DB real compartida/tenants ajenos, no borrar audit ledger | restore aislado funcional |
| Evidencia de QA y observabilidad | GH artifacts/logs/telemetría | no QR, tokens, números, RIF, datos clínicos o financial raw | correlation IDs seguros conservados |

## Definition of Security DONE
- Tests negativos con PostgreSQL17 aislado/efímero, A/B/role/owner, aislamiento por run y cleanup `finally`; ninguna modificación de datos compartidos.
- ASVS 5.0 / API Security Top 10 como *checklists* de diseño y verificación, no certificación. Security findings reproducibles con endpoint/test/expected/actual y clasificación de severidad.
- GitHub Actions exact SHA del candidato + suites anteriores, lint/typecheck/build, Chromium gate PR, Firefox/WebKit según matriz, pruebas físicas/soak específicas de Hípico.
- Confirmar contract del proyecto: 1 autoridad RBAC/tenant, 1 ledger financiero, 6 CSS owners, migraciones aditivas con rollback.
- No registrar PASS para proveedores, cuentas, restore, seguridad externa o rendimiento si no se ejecutaron; no cerrar meta-tickets por incidentes documentados.
- En UX: mensajes de error que eviten detalles internos, estados de sesión/permiso claros, acción de revocar/recuperar auditable, navegación segura sin pérdidas de borrador.
- Evidence: baseline/final SHA, test/step, expected/actual, riesgos y plan de rollback en el PR.

## Skills, agentes y herramientas
- **Controles de seguridad:** `contagest-appsec-review`, `contagest-secure-verification`, `contagest-tenant-isolation-rbac`, `contagest-db-migration-safety`; ejecutar el router real y conservar sus 2–4 ACTIVE slots.
- **Operación Hípico:** `contagest-hipico-lab-operations`, `contagest-bcp-dr`, `contagest-release-evidence`; agentes project-owned `hipico-reliability` y `qa-release`.
- **CI/integración:** GitHub connector (PR/revisión/Actions exact SHA), Playwright MCP del repo (`.mcp.json`) + pruebas Node/PG. No agregar herramientas con privilegios sobre datos/producción sin aprobación ni enviar PII a servicios externos.
- **Riesgo adicional:** revisar avisos de dependencias bajo #656; proveedor externo no se declara verde por código local.

## Fuentes
- https://owasp.org/projects/asvs (ASVS 5.0)
- https://api-security.owasp.org/
- https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/CSV_Injection_Prevention_Cheat_Sheet.html

**Fuera de alcance del documento:** ejecutar pentest contra cuentas reales, enlazar WhatsApp SOURCE sin permiso, mover secretos a un MCP ajeno o afirmar cumplimiento legal por un checklist.