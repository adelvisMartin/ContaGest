# Guía de estudio — Hípico #117: Backup / Restore seguro

## Idea central

Un backup útil no es sólo “descargar JSON”. Debe demostrar **qué contiene, con qué versión fue creado, que no fue alterado y cómo se restaura sin destruir el estado actual**.

## 1. Manifest versionado

`_backup` registra schema del backup, schema local, versión del producto, fecha, hash e inventario de inclusión/exclusión.

Esto permite fallar cerrado ante formatos futuros o incompatibles.

## 2. Sanitización

Tokens, sesiones, cookies, QR, service-role, private keys, passwords y signed URLs no deben salir del dispositivo dentro del backup.

La sanitización ocurre al exportar **y otra vez al importar**. Repetirla al importar evita que un archivo manipulado inyecte material secret-like aunque su hash ignore esos campos.

## 3. Integridad vs confidencialidad

SHA-256 detecta alteración accidental/intencional del contenido canonizado, pero no oculta los datos.

AES-GCM aporta confidencialidad y autenticidad del envelope cifrado. La clave se deriva de una passphrase mediante PBKDF2-SHA256 con salt aleatorio.

```text
hash != encryption
integrity + encryption = propiedades distintas y complementarias
```

## 4. Restore seguro

Secuencia:

```text
decrypt/parse
-> schema check
-> hash check
-> sanitize
-> reconcile
-> confirm
-> snapshot previo
-> replace
-> reload
-> server-ledger reconciliation
```

Nunca sobrescribir primero y validar después.

## 5. Reconciliación

El backup local no sustituye al ledger server-side. La reconciliación local detecta IDs duplicados y valores monetarios malformados; la verificación monetaria final sigue siendo autoridad del servidor.

## 6. Legacy

Un JSON antiguo sin manifest puede migrarse sólo con warning explícito. No puede demostrar integridad histórica, por eso no debe presentarse como equivalente a un backup v2.

## 7. RPO y RTO

- **RPO**: cuánto dato reciente podría perderse; aquí se aproxima con la antigüedad del backup elegido.
- **RTO-local**: tiempo hasta que la PWA vuelve a ser usable localmente.
- **RTO-verified**: tiempo hasta que además la reconciliación autoritativa vuelve a estar green.

## 8. Qué probar

Automatizable:

- vector SHA-256 conocido;
- secret stripping;
- tamper/hash mismatch;
- schema futuro;
- AES-GCM correcto/contraseña errónea;
- passphrase débil;
- duplicados/importes inválidos;
- interception de export/import;
- precache de módulos seguros.

Físico:

- browser limpio;
- Android/PWA;
- archivo corrupto;
- restore interrumpido;
- reload;
- reconciliación server-side;
- medición RPO/RTO.

Los drills físicos pertenecen a #119/#121 y no deben duplicar el ticket de implementación una vez que #117 esté integrado en `main`.

## Preguntas de repaso

1. ¿Por qué SHA-256 no reemplaza AES-GCM?
2. ¿Por qué sanitizar también durante import?
3. ¿Qué problema resuelve el snapshot previo al restore?
4. ¿Por qué un backup del navegador no reemplaza el ledger autoritativo?
5. ¿Qué diferencia existe entre RTO-local y RTO-verified?
