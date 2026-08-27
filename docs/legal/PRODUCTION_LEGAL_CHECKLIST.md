# Gate legal de producción

No habilitar clientes reales hasta completar todos los ítems obligatorios.

- [ ] Identidad legal del proveedor definida y cargada en `LEGAL_PROVIDER_*`.
- [ ] Abogado venezolano revisó Términos, Privacidad, Cookies, Uso Aceptable y Suspensión/Terminación.
- [ ] Se validó régimen actual de contratos de adhesión/protección al consumidor aplicable al tipo de cliente.
- [ ] Se definió emisión de factura/recibo, impuestos y moneda contractual.
- [ ] Se aprobó política de renovación, mora, gracia, reembolso y cancelación.
- [ ] Se validó jurisdicción/mecanismo de disputas.
- [ ] Se publicó contacto real de privacidad y soporte.
- [ ] Inventario real de subprocesadores/hosting/backups completado.
- [ ] Transferencias internacionales evaluadas si corresponden.
- [ ] Tabla de retención por categoría aprobada.
- [ ] Proceso de exportación y borrado probado.
- [ ] Legal hold definido.
- [ ] Corrección excepcional de RIF requiere identidad + documento SENIAT + doble aprobación + auditoría.
- [ ] Cambios de documentos incrementan versión; CI verifica hash y primer acceso.
- [ ] Modal legal probado en móvil/tablet/desktop y con teclado.
- [ ] Rechazar términos cierra sesión; ninguna API de negocio queda accesible con aceptación pendiente.
- [ ] Cookies necesarias documentadas; analítica backend OFF por defecto; marketing OFF.
- [ ] Para Salud humana: addendum, confidencialidad, retención, roles, incidentes y proveedores revisados por especialista.
- [ ] Para veterinaria/fitness: revisar qué datos de personas se recopilan y minimizar.

## Controles técnicos de #29

- [x] La API continúa bloqueando producción mientras la identidad contractual tenga placeholders.
- [x] La validación runtime de identidad rechaza valores vacíos, placeholders, `example.com` y correos con formato inválido.
- [x] El runtime exige `LEGAL_REVIEW_APPROVED_VERSION` igual a `LEGAL_DOCUMENT_VERSION` y `LEGAL_REVIEW_EVIDENCE_SHA256` válido antes de permitir aceptación o APIs de negocio a un cliente licenciado en producción.
- [x] La atestación canónica `backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json` forma parte del build; en este branch permanece `pending` y por sí sola mantiene producción cerrada.
- [x] El runtime exige que esa atestación esté `approved`, tenga revisor/jurisdicción/evidencia/aprobaciones completas, coincida con la versión vigente y con la identidad exacta del proveedor configurado.
- [x] El SHA-256 configurado en runtime debe coincidir con el SHA-256 declarado por la atestación incluida en el build.
- [x] `backend/.env.example` documenta las variables de identidad y de vínculo con la revisión profesional sin inventar valores reales.
- [x] La evidencia contractual nueva aplica la política `authenticated-context-no-network-identifiers.v1`: no persiste IP ni user-agent crudos en `LegalAcceptance`, `CookiePreference` ni el `AuditLog` generado por la aceptación.
- [x] El backend sigue siendo autoridad: una versión/hash vigente no aceptada devuelve HTTP 428 en APIs protegidas.
- [x] El frontend invalida su caché local de aceptación cuando una API protegida devuelve HTTP 428 y vuelve a consultar `/legal/status` para exigir reaceptación.
- [ ] E2E de primer acceso, rechazo y reaceptación ejecutado y verde sobre el SHA candidato.
- [ ] `npm run qa:legal:production` ejecutado con identidad real, atestación aprobada y variables runtime coincidentes sobre el SHA candidato.

La decisión de ingeniería de no conservar identificadores de red en la evidencia legal es **privacy-by-default** y debe ser confirmada o modificada expresamente durante la revisión profesional. No borra registros históricos ni define por sí sola la retención de logs HTTP/seguridad generales.

## Atestación profesional vinculada al release

El esquema de referencia es `docs/legal/LEGAL_RELEASE_ATTESTATION.example.json`. La atestación que realmente controla el runtime es `backend/src/shared/legal/LEGAL_RELEASE_ATTESTATION.json` y debe viajar en el mismo build que se pretende habilitar.

Una aprobación real debe:

1. declarar `status: "approved"`;
2. coincidir exactamente con `LEGAL_DOCUMENT_VERSION`;
3. contener el objeto `provider` con nombre/RIF/domicilio/correos exactos del entorno productivo;
4. identificar al profesional revisor y jurisdicción `VE`/`Venezuela`;
5. referenciar la evidencia profesional adjunta al release y registrar su SHA-256;
6. marcar explícitamente cada decisión jurídica/contractual obligatoria como aprobada.

Después de aprobarla, el entorno de producción debe configurar:

```text
LEGAL_REVIEW_APPROVED_VERSION=<misma LEGAL_DOCUMENT_VERSION aprobada>
LEGAL_REVIEW_EVIDENCE_SHA256=<mismo SHA-256 declarado en la atestación>
```

El runtime verifica además que la identidad `LEGAL_PROVIDER_*` coincida exactamente con el objeto `provider` de la atestación incluida en el build. `LEGAL_RELEASE_ATTESTATION_PATH` es únicamente un override para pruebas del gate CLI; no reemplaza la atestación canónica empaquetada.

El gate verifica **presencia, versión, identidad, vínculo runtime e integridad declarada de la atestación**. No puede verificar que el criterio jurídico del profesional sea correcto ni convierte la automatización en asesoría jurídica.

### Comandos

```bash
npm run qa:legal:production
npm run qa:production
npm run qa:production:full
```

`qa:production` y `qa:production:full` ejecutan primero el gate legal y no continúan si falta identidad real, evidencia profesional aprobada o el vínculo runtime correspondiente.

**Regla:** que el código esté verde no convierte este checklist en asesoría jurídica. El release owner debe adjuntar evidencia de la revisión profesional antes del primer tenant real.
