# Control Hípico — mapa de mercado y tickets REA

**Corte de fuentes:** 14 de octubre de 2026. **Muestra curada**, por categoría; no representa todos los productos del mercado. Cada enlace externo es evidencia competitiva para entender un flujo. No copiar código, datos de terceros, identidad visual ni mensajes.

## Referencias suministradas por el usuario

| Referencia | Función observada/documentada | Cómo traducirla a requisitos propios | Límite |
| --- | --- | --- | --- |
| Websimproco Triple Crown — reporte personal, historial y movimientos consolidados (links temporales omitidos) | Estado/cuenta individual por fecha; actividad diaria e historial; tabla consolidada con depósitos/retiros/transferencias, filtros y exportación | Control Hípico debe usar authority de ledger propia, filtros scope-aware, fórmula temporal explícita, link con expiración/revocación y PII mínima. Ya está asignado a PR #999/#1000. | UI observada no prueba fórmula backend, autorización de token ni seguridad. No guardar el query token. |
| [LatamTurf](https://latamturf.bet/) + captura del usuario | Plataforma de apuestas por jurisdicción y pantalla de vendedor/subasta; selección de evento, pizarras, porcentaje, incentivo, ticket e informe de cuadre | Separar remates de apuestas/caja de taquilla; registrar pujas/tickets y liquidación con reglas aprobadas, permisos y Decimal. Nuevo issue #1010. | Solo navegación/captura autorizada y sin transacciones; no copiar endpoint/credenciales ni inferir legalidad del producto. |
| Post de lanzamiento [Wink](https://x.com/metavarce/status/2110046379477434839?s=46) | Presenta POS móvil para venta rápida | Benchmark de rapidez de venta para ContaGest #765, manteniendo facturación y contabilidad bajo authorities fiscales del ERP. | Mensaje social promocional, no evidencia funcional independiente. |

## Plataformas hípicas y de apuestas

| Producto | Categoría / capacidades a investigar | Uso para Control Hípico |
| --- | --- | --- |
| [AmTote](https://www.amtote.com/products-and-services) | Tote/parimutuel y fixed odds, terminales y caja, customer accounts, feeds, auditoría/reportes de handle/payout/reconciliation | Separar pool pari-mutuel, fixed odds y balances; referencias de robustez, liquidación y reportes. No asumir el mismo modelo regulatorio/escala. |
| [EQUUS / America Simulcast](https://www.americasimulcast.com/) | Video/streaming, datos de carreras, POS, cuenta de usuario, modalidades/pools y eventos | Benchmark de selección de jurisdicción/hipódromo, estado oficial de evento y distribución. Verificar roles y derechos de datos. |
| [BookPOS](https://bookpos.net/es/software-para-casas-de-apuestas.aspx) | Comercialización de software para casas de apuestas e hipódromos | Lista de sesiones, participantes, perfiles y control de operaciones; claims deben confirmarse funcionalmente. |
| [Regal23](https://regal23.com.ve/productos/) y [Multisport](https://www.multisport.com.ve/index.html) | Oferta venezolana de carreras/apuestas, virtuales y comercialización | Entender canales y vocabulario local; no tomar texto promocional como cumplimiento o autoridad. |
| [LatamTurf](https://latamturf.bet/) | Taquilla por país/modalidad y remates con cuadre separado | Benchmark de operaciones de taquilla y, en nuevo #1010, módulo opcional de remates. |
| [HipNumber](https://hipnum.com/) | Software dedicado a subastas: catálogo/pedigree/media, aprobación de compradores, sala + online, adjudicación y liquidación | Referencia para flujo de lote, sala, comprador, adjudicación/settlement; nuevo #1010. |

## Información de cuentas, reportes y grupos

Websimproco se usa únicamente como referencia para controles de estado personal, historial por fecha y movimientos consolidados. La implementación de Control Hípico debe tomar los hechos de sus propios eventos/ledger y preservar aislamiento por owner, grupo, participante, moneda y fecha. PR #999 implementa pantallas internas; PR #1000 cubre links seguros dependientes de #999. Confirmar bases/HEADs y ejecutar pruebas antes de integrar.

## Chatbot: mercado de referencia y canal realmente solicitado

**Alcance del propietario (2026-10-15):** grupo privado de amigos, apuestas hípicas recreativas, sin dinero real, depósitos, pagos, retiros o premios canjeables; canal previsto: WhatsApp Messenger normal. No usar WhatsApp Business ni su aplicación, Cloud API, Business Platform o Groups API. Esta definición corresponde al grupo recreativo y no cambia otras autoridades financieras del producto.

| Referencia | Qué aporta al benchmark | Estado para este proyecto |
| --- | --- | --- |
| [Condiciones del servicio de WhatsApp (Messenger)](https://www.whatsapp.com/legal/terms-of-service?lang=es) | Condiciones del canal normal; restringen mensajería automática y otros usos no personales salvo autorización (revisión 2026-10-15). | Fuente primaria del gate. Sin autorización expresa comprobable, autoenvío a `SOURCE` queda `NO-GO`. |
| [Respond.io](https://respond.io/integrations/whatsapp) | Patrones de inbox, asignación, workflows, supervisión y handoff humano. | Solo inspiración UX; no habilita la integración con el grupo normal. |
| [Wati](https://www.wati.io/geo/blog/decision-guide/one-whatsapp-inbox-for-leads-support-and-campaigns) | Operación de bandeja compartida y enrutamiento. | Solo benchmark; producto Business no seleccionado. |
| [Twilio WhatsApp](https://www.twilio.com/docs/whatsapp/api) | Patrones de webhooks, entrega y observabilidad en integraciones empresariales. | Solo benchmark técnico; API Business excluida del alcance. |
| [Manychat](https://help.manychat.com/hc/en-us/articles/19247843644060-How-to-connect-WhatsApp-to-Manychat-choosing-the-best-method) | Builder de flujos y respuestas automáticas. | Solo benchmark; no es una ruta aprobada para el grupo Messenger. |

WhatsApp Business/Groups API quedan excluidos: sus políticas y capacidades no son el canal de esta solicitud. La diversión y ausencia de dinero eliminan el supuesto de apuestas monetarias para este grupo, pero no anulan las condiciones de Messenger sobre automatización. Continuar #892/#907 en LAB con datos sintéticos y construir respuestas sugeridas editables con envío manual nativo; no automatizar el grupo fuente mediante DOM, RPA, sesión web no autorizada, Baileys u otro proveedor no oficial. El ticket #1011 documenta el gate sin volver a preguntar al propietario sobre el carácter monetario.

## Qué debe entregar REA y ChatGPT

1. Inventario por referencia: empresa, producto, versión/fecha, URL, licencia (si código), tipo de fuente, categoría y límite de acceso.
2. Escenarios de prueba visibles por pantalla y estado; capturas saneadas con hash; no persistir bearer links, cookies, usuarios, mensajes privados ni cuentas ajenas.
3. Tabla por capacidad: observada/documentada/reclamo/no comprobada; consecuencia de producto; owner existente; gap candidate o `NOT_APPLICABLE`; criterio y prueba.
4. Comparar semántica del dominio antes de UI: apuestas virtuales recreativas no son movimientos monetarios ni asientos contables; apuestas no son remates; pool pari-mutuel no es fixed odds; cuenta de participante no es comprador/consignador; cuotas/commission no son contabilidad.
5. Consultar #837, #892, #907, #999, #1000, #1010, #1011 y #707/#764 antes de nuevos issues.
6. Reimplementar el comportamiento permitido con arquitectura propia. REA no clona el tercero ni verifica internals ocultos.

## Estado de investigación

- `PASS`: muestra de productos y categorías con fuentes públicas enlazadas.
- `PARTIAL`: feature-level verification de proveedores y workflows completos.
- `NOT_EXECUTED`: captura/ejecución de REA 6.5.0; product QA en SHA de #999/#1000; política/legal review específica de operador/cuenta.
- No se creó apuesta, ticket, subasta, depósito, retiro, mensaje o cambio productivo durante esta investigación.
