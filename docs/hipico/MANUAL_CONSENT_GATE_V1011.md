# #1011 — Declaración de consentimiento para copia MANUAL (incremento parcial)

**Producto:** Control Hípico · WhatsApp Messenger normal, grupo privado de amigos, juego recreativo sin dinero real ni efectos económicos. No se usará WhatsApp Business, Business Platform, Cloud API ni Groups API.

## Riesgo corregido

La UI manual existente pedía revisar el contenido, pero no preguntaba si el grupo había autorizado compartirlo o si incluía información privada de terceros. Una persona podía copiar texto con una sola confirmación, aun sin consentimiento declarado. El control no sustituye consentimiento verificable de los miembros ni una evaluación legal.

## Alcance implementado

- El campo **«Declaro que el grupo ha autorizado compartir este contenido y que no incluyo datos privados de terceros sin permiso»** inicia desmarcado. El botón **Copiar texto** permanece deshabilitado hasta que exista borrador no vacío de hasta 1200 caracteres, consentimiento marcado, revisión del contenido marcada y ausencia de copia en curso.
- Cambiar el consentimiento invalida la revisión previa; hay que revisar el borrador nuevamente. Un resultado tardío de Clipboard API no puede marcar **Copiado** si el consentimiento cambia durante la operación. Se mantiene bloqueo single-flight.
- **Cancelar y borrar**, cierre del diálogo y desmontaje descartan borrador, autorización y revisión. Texto y declaraciones no van a backend, red, storage o logs; la Clipboard API se usa sólo tras acción manual.
- La declaración es **local y efímera**: no certifica que todos los participantes hayan dado opt-in ni permite acceder al grupo. Sin fuente entrante, proveedores, números, identificadores directos, saldo/ledger, API o DDL.
- SOURCE sigue NO_GO tanto para lectura `SOURCE_AUTO_READ_POLICY_NO_GO` como para envío `SOURCE_AUTO_REPLY_POLICY_NO_GO`; no se llama WhatsApp Web, DOM, RPA o cliente no oficial.

## Política y decisión

**Fuente primaria consultada 2026-10-16:** [Condiciones de WhatsApp Messenger](https://www.whatsapp.com/legal/terms-of-service?lang=es), sección «Uso legal y aceptable de nuestros servicios» (auto-messaging y uso no personal sin autorización). También [WhatsApp Messaging Guidelines](https://www.whatsapp.com/legal/messaging-guidelines), última actualización visible 2026-09-23, aplicable a chats/grupos. No hay autorización expresa verificada para autolectura o autoenvío en grupos Messenger; por tanto la decisión operativa sigue **NO-GO** para SOURCE. Responsable de revalidación: propietario/seguridad antes de cualquier propuesta de habilitación; próxima revisión obligatoria: antes del siguiente lanzamiento/integración, no mediante presunciones o flags.

### Revisión requerida y límites

`GO` únicamente para asistencia manual en el panel, con declaraciones humanas y revisión caso por caso; no acredita consentimiento real externo. `NO-GO` para SOURCE automatizado; `BLOCKED` para una futura habilitación automática sin evidencia oficial, revisión independiente y pruebas autorizadas. Queda pendiente recoger/verificar consentimiento real del grupo por procedimiento del propietario, diseño formal de retención/pausa, QA Chromium/Android/teclado/lector de pantalla, privacidad con usuarios reales y gates exact-SHA de CI. Un merge no equivale a release.

## Casos cubiertos por nueva regresión

`tests/hipico_manual_consent_v1011.test.mjs`: no consentimiento aunque revisado; consentimiento sin revisión; copia solo con ambos; revocación exige reconfirmación; race clipboard y doble clic; cancelar limpia; aviso visible y ausencia de red/storage. Los dos harnesses antiguos simulan **consentimiento previamente declarado** para conservar las regresiones ya implementadas y diferenciar sus precondiciones.

**Comandos obligatorios para validación en checkout completo** (no afirmar ejecutados por este documento):
```sh
node --check frontend/public/hipico-control/assets/js/operational-copy-center.js
node --test tests/hipico_manual_messenger_suggestion_v1011.test.mjs tests/hipico_manual_messenger_reconfirmation_v1011.test.mjs tests/hipico_manual_clipboard_revision_v1011.test.mjs tests/hipico_manual_consent_v1011.test.mjs
node scripts/hipico-root-contracts.mjs
npm run lint && npm run build
```

**Rollback:** revertir los cambios de la UI y sus fixtures junto al nuevo test/guía; no hay migración ni datos remotos por revertir. **Issue #1011 sigue OPEN hasta demostrar DoD completo**, incluidas política vigente, consentimiento real y QA material.
