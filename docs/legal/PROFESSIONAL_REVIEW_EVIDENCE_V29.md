# Issue #29 · cadena de evidencia para revisión jurídica profesional

Este documento **no es asesoría jurídica** y no aprueba los textos legales. Su función es hacer reproducible qué versión exacta de los textos, checklist y atestación fue revisada externamente antes de autorizar un cliente real.

## Estado actual

Mientras `backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json` permanezca con `status: pending`, el estado correcto es:

```text
BLOCKED FOR REAL CUSTOMERS
```

No se debe cambiar a `approved` para obtener un check verde. La aprobación debe corresponder a una revisión profesional real y a la identidad contractual real del proveedor.

## Generar paquete de evidencia

Desde la raíz:

```bash
npm run qa:legal:evidence
```

Salida:

```text
artifacts/release/legal-v29/LEGAL_REVIEW_EVIDENCE.json
artifacts/release/legal-v29/LEGAL_REVIEW_EVIDENCE.md
artifacts/release/legal-v29/SHA256SUMS.txt
```

Con la atestación pendiente el comando termina con código `2` y veredicto `BLOCKED`. Esto es intencional.

El manifest registra hashes SHA-256 de:

- catálogo legal canónico/versionado;
- atestación empaquetada;
- matriz jurídica de ingeniería;
- handoff para revisión profesional;
- checklist de producción;
- revisión de fuentes venezolanas.

Así el profesional y el release owner pueden demostrar qué archivos concretos formaron el paquete entregado.

## Entrega al profesional

La entrega debe incluir, fuera de secretos y datos de clientes:

1. `LEGAL_REVIEW_HANDOFF_V1.md`;
2. textos vigentes identificados por `LEGAL_DOCUMENT_VERSION`;
3. identidad real propuesta del proveedor: nombre/razón social, RIF, domicilio, correo legal y soporte;
4. decisiones comerciales reales sobre jurisdicción, disputas, facturación, impuestos, moneda, mora, cancelación y reembolso;
5. inventario real de hosting/subprocesadores/transferencias;
6. política real de retención aplicable;
7. decisión sobre minimización/retención de IP en evidencia;
8. addendum de salud humana antes de datos clínicos reales;
9. manifest y `SHA256SUMS.txt` generados por este gate.

No enviar secretos, tokens, contraseñas, dumps productivos ni PII de clientes como “evidencia legal”.

## Recepción de la revisión

Una vez recibida la revisión profesional:

- conservar la evidencia original en la custodia definida por el release owner;
- calcular SHA-256 del archivo/paquete de evidencia aprobado;
- completar la referencia y hash en la atestación canónica;
- completar identidad exacta del proveedor revisado;
- marcar únicamente los `approvals` efectivamente cubiertos;
- fijar `reviewedAt`, reviewer y jurisdicción;
- conservar el mismo `LEGAL_DOCUMENT_VERSION` revisado; si cambian textos materiales, versionar y revisar de nuevo.

El repositorio puede guardar la referencia/hash y la atestación aprobada; no es obligatorio versionar un documento externo confidencial si la política comercial/jurídica determina que debe custodiarse fuera del código.

## Runtime

Después de una aprobación real deben coincidir, sin aproximaciones:

```text
LEGAL_REVIEW_APPROVED_VERSION
=
LEGAL_DOCUMENT_VERSION
=
attestation.legalDocumentVersion
```

Y:

```text
LEGAL_REVIEW_EVIDENCE_SHA256
=
attestation.evidence.sha256
```

La identidad `LEGAL_PROVIDER_*` del runtime también debe coincidir con `attestation.provider`.

## Gates finales

Después de completar la revisión real:

```bash
npm run qa:legal:evidence
npm run qa:legal:production
```

Ambos deben ejecutarse sobre el SHA candidato. Después corresponde el E2E de primer acceso, rechazo/logout y reaceptación de nueva versión.

`PASS` de estos comandos demuestra integridad técnica de la cadena y configuración; no sustituye el juicio del profesional que realizó la revisión.

## Cierre del issue

#29 sólo puede cerrarse cuando exista evidencia real de revisión profesional y se satisfagan los criterios externos del issue. El merge de este PR de cadena de custodia **no cierra #29** por sí mismo.
