# Control Hípico — cuatro autoridades y QA final (2026-10-16)

Este incremento responde a #892, #842, #267 y #1018 con **hardening de código**; no equivale a la aceptación completa de ninguno de los cuatro tickets. Se preservan #728 (SOURCE read-only), #837/#839 (GO/NO-GO) y todas las autoridades ya fusionadas.

| Autoridad | Incremento de código | Pendiente real para QA final |
| --- | --- | --- |
| #892 LAB conversacional | `queryCanonicalLab` niega propósitos no incluidos en el catálogo de consultas de solo lectura **antes de HTTP** | PG17 efímero, Chromium, Windows/WhatsApp LAB real, dedupe/WAL/quoted replies, takeover, 24–72h soak #120; nunca SOURCE automático |
| #842 backup DR | `hipico-backup-postgres.sh` compara el SHA-256 del inventario de entrada contra el archivo canónico **antes** del verificador de rol y del primer SQL/dump | Rol `hipico_backup` real con verificador 25/25; backup cifrado off-site sin delete; restore aislado PG17, FKs, conteos, RPO/RTO observados |
| #267 Auth recovery | El cliente no interpreta ni refleja payloads de error del proveedor; usa códigos seguros basados en estado HTTP | Verificar Redirect URLs de Supabase y correo/click/cambio de contraseña/reauth sobre identidad propia controlada, PWA/browser física, UUID/perfil intactos |
| #1018 reportes compartibles | Cabeceras `no-store`/`no-referrer` existentes más `nosniff`, `same-origin` y permisos de navegador limitados | RLS PG17/staging, revocación/caducidad/concurrencia, redacción del query `t` en CDN/proxy, conciliación ledger/PWA, consentimiento del dueño; mantener feature OFF |

## QA focal disponible sin CI externa

```bash
node --test tools/hipico-whatsapp-web-bridge/tests/lab-canonical-query.test.mjs
node --test tests/hipico_password_recovery_issue_267.test.mjs
node --test tests/hipico_backup_inventory_scope_v842.test.mjs
npm --workspace backend exec -- tsx --test src/modules/hipico/report-share.routes.test.ts
bash -n ops/backup/hipico-backup-postgres.sh
```

**No ejecutar comandos de DR reales** sin confirmar credenciales de mínimo privilegio, ubicación cifrada aprobada, host de restauración aislado y candidate SHA. El script `hipico-backup-postgres.sh` conecta con una DB y copia datos cifrados fuera del host; `bash -n` solo valida sintaxis.

Los QA de PostgreSQL, proveedor externo, WhatsApp físico y autorización de enlaces permanecen **NOT_EXECUTED** hasta la campaña final del propietario. No publicar tokens, cadenas de conexión, chats de usuarios ni evidencia financiera sensible en GitHub. No cambiar checks requeridos o activar rutas de producción para simular éxito.

**Rollback**: revertir el commit de este PR. No hay migraciones nuevas ni cambios de datos.
