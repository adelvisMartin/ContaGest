# Control Hípico — matriz de fuentes/proveedores hípicos

Fecha de revisión: 2026-09-12.

## Regla de integración

Una fuente no obtiene una capability por intuición, scraping oportunista ni similitud visual. Para habilitar un adapter automático debe existir documentación oficial/contrato autorizado que demuestre el recurso, su semántica y el método de acceso. Todo provider externo conserva `financialAuthority=false`; los conflictos se elevan a revisión y nunca sustituyen el ledger.

## Sportradar Unified Odds Feed (UOF)

Estado: **adapter autorizado/configurable, capabilities deliberadamente limitadas**.

Documentación oficial revisada:

- Summary endpoint: https://docs.sportradar.com/uof/api-and-structure/api/sport-event-information/summary-of-a-sport-event-endpoint/endpoint
- Fixture endpoint: https://docs.sportradar.com/uof/api-and-structure/api/static-sport-event-information/fixture-endpoint/endpoint
- Sport Event Information: https://docs.sportradar.com/uof/introduction/key-concepts/sport-event-information

Hallazgos verificables:

- Summary usa `sports/{language}/sport_events/{urn_type}:{id}/summary.xml` y autenticación `x-access-token`.
- La documentación identifica `sr:stage:<id>` para race results.
- Fixture admite eventos de tipo stage.
- UOF expone odds/markets/resultados en su ecosistema, pero este adapter de Control Hípico **no** declara capabilities que todavía no estén implementadas y normalizadas en el código actual.

Capabilities actuales del adapter: `getRace`, `getResult`.

No soportadas actualmente y por tanto deben devolver `PROVIDER_CAPABILITY_UNSUPPORTED`: `listMeetings`, `getMeeting`, `getEntries`, `getScratches`.

Seguridad de transporte: HTTPS, hostname vendor allowlisted, sin credenciales/query/hash/path configurables, redirects rechazados, IDs acotados, timeout, límite de respuesta, XML sin DTD, cache acotado y resolución DNS validada contra loopback/redes privadas/link-local/ULA/documentación/multicast antes del fetch.

## Instituto Nacional de Hipódromos (INH) / La Rinconada

Estado: **fuente oficial de publicación localizada; API estructurada pública NO VERIFICADA**.

Canal oficial localizado:

- Telegram INH: https://t.me/s/INHOficial

El canal se identifica como cuenta oficial del Instituto Nacional de Hipódromos y publica programación, retirados, órdenes de llegada, dividendos y comunicaciones de La Rinconada. En la revisión actual no se encontró documentación oficial de una API pública estructurada con contrato técnico, autenticación y estabilidad suficiente para habilitar un adapter automático.

Consecuencia de producto:

- Las publicaciones oficiales pueden ingresar como evidencia/documento con provenance y revisión correspondiente.
- No se inventa `/api` del INH ni se convierte HTML/Telegram en una supuesta API oficial.
- Un futuro adapter INH debe tener ADR/contrato propio y pruebas con fixtures autorizados antes de promoverse.

## Hipódromo Nacional de Valencia

Estado: **API estructurada oficial NO VERIFICADA en esta revisión**.

No se habilita adapter automático hasta disponer de documentación oficial/contrato autorizado que permita demostrar endpoints y semántica. Material publicado por terceros puede servir como evidencia documental, nunca como “API oficial” por inferencia.

## Orden de fallback

1. API estructurada oficial verificada.
2. Provider autorizado con contrato/capability demostrada.
3. Feed/documento oficial con provenance verificable.
4. PDF oficial cargado y validado.
5. Entrada explícita de operador.
6. Evidencia del grupo.
7. Nunca una suposición de IA.

## Criterio de promoción de una nueva fuente

Antes de registrar una nueva capability se exige: documentación oficial o autorización contractual; hostname/origen permitido; esquema normalizado; freshness/provenance; límites de timeout/tamaño/cache; protección SSRF; fixtures reproducibles; pruebas de conflicto; ausencia de secretos en respuesta/logs; y confirmación explícita de que `financialAuthority` continúa en `false` salvo una decisión de dominio separada y auditada.
