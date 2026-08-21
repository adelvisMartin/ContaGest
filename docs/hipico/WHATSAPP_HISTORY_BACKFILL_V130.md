# Control Hípico · WhatsApp histórico v1.3.0

## Objetivo

Recuperar de `CLUB HIPICO TRIPLE CROWN` todo el histórico que WhatsApp Web entregue al dispositivo vinculado y persistirlo como dataset shadow auditable antes de continuar con la escucha en tiempo real.

## Seguridad

- el grupo oficial es solo lectura;
- el backfill nunca envía mensajes al LAB;
- no crea apuestas ni efectos monetarios;
- todos los eventos son idempotentes por ID externo;
- una interrupción deja pendientes locales para reintento.

## Límites por defecto

- 50.000 mensajes;
- 90 minutos;
- 8 rondas consecutivas sin mensajes más antiguos;
- 1.200 ms entre rondas;
- 4 uploads concurrentes;
- checkpoint de hasta 250.000 IDs.

## Evidencia

`data/history-sync-report.json` registra:

- `uniqueFound`;
- `delivered`;
- `duplicates`;
- `pending`;
- `earliestSourceTimestamp`;
- `latestSourceTimestamp`;
- `stopReason`.

El gate considera agotado el histórico disponible cuando `stopReason=stable_oldest_available` y `pending=0`.

Esto no garantiza mensajes que WhatsApp no sincronice hacia el dispositivo vinculado; solo lo que WhatsApp Web efectivamente exponga.

## Multimedia

Se registra tipo de media, caption/texto visible, nombre del documento si aparece y metadata del mensaje. Los binarios históricos de imagen/PDF no se descargan ni interpretan automáticamente en esta fase.
