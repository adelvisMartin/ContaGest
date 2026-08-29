# Control Hípico — Backup / Restore (#117)

## Alcance e inventario

El backup portable incluye el workspace local de negocio: participantes, jornadas/carreras, movimientos operativos, settings contenidos en el workspace y evidencia local contenida en él. Excluye material de auth/session/token/cookie/QR/service-role/private-key/password/signed-URL.

Los perfiles/credenciales de WhatsApp son un dominio de recuperación separado y nunca forman parte del backup por defecto. El ledger PostgreSQL append-only autoritativo tampoco es reemplazado por un respaldo del navegador: después de restaurar cliente, producción debe reconciliar contra ese ledger.

## Formato v2

Cada backup contiene `_backup` con:

- versión de schema del backup;
- versión de schema local IndexedDB;
- versión del producto;
- timestamp de creación;
- SHA-256 del workspace sanitizado y canonizado;
- política de inclusión/exclusión.

JSON legacy sólo se importa tras warning explícito. Schema futuro/incompatible o hash distinto se rechaza. Tanto backups v2 como legacy se sanitizan antes de devolver el workspace restaurable, de modo que campos con nombres de secretos no llegan a persistencia local aunque un archivo manipulado intente inyectarlos.

## Cifrado off-device

Export/Import se interceptan en capture phase por `backup-secure-ui.js`. Export exige passphrase de al menos 12 caracteres y usa:

- PBKDF2-SHA256, 250.000 iteraciones;
- salt aleatorio de 128 bits;
- AES-GCM-256;
- IV aleatorio de 96 bits.

El envelope cifrado no contiene el workspace en plaintext.

## Secuencia de restore

1. Parse/decrypt.
2. Validar formato/schema.
3. Verificar SHA-256.
4. Sanitizar material secret-like.
5. Reconciliar IDs duplicados y valores monetarios locales malformados.
6. Exigir confirmación explícita.
7. Crear snapshot `antes-de-restore-portable` del workspace actual.
8. Reemplazar el workspace primary.
9. Reload.
10. En producción, reconciliar evidencia restaurada con el ledger server-side antes de declarar balances verificados.

## Errores fail-closed

- hash mismatch → `HIPICO_BACKUP_HASH_MISMATCH`;
- schema futuro → `HIPICO_BACKUP_SCHEMA_INCOMPATIBLE`;
- passphrase incorrecta/tamper AES-GCM → `HIPICO_BACKUP_DECRYPT_FAILED`;
- duplicate IDs/importe inválido → `HIPICO_BACKUP_RECONCILIATION_FAILED`;
- falta confirmación → `HIPICO_RESTORE_CONFIRMATION_REQUIRED`.

## RPO / RTO

El drill físico debe registrar:

- `RPO`: antigüedad del backup al iniciar restore;
- `RTO-local`: restore start → PWA usable con workspace restaurado;
- `RTO-verified`: restore start → reconciliación server-ledger green.

Los targets deben acordarse antes del drill y la medición pertenece al SHA candidato.

## Drill físico pendiente

- browser/profile limpio;
- Android/PWA fresh restore;
- JSON corrupto;
- hash alterado;
- passphrase incorrecta;
- schema futuro;
- migración legacy;
- confirmación de reemplazo;
- interrupción durante restore/reload;
- reconciliación post-restore.

Estos escenarios quedan centralizados en #119/#121. Si no se ejecutan, su estado es `NOT_EXECUTED/BLOCKED`; no es motivo para duplicar el ticket de implementación una vez que el contrato esté integrado en main.

## Rollback

Nunca hacer rollback borrando IndexedDB. El rollback debe entender schema local v2 y respetar el compatibility set de #118.
