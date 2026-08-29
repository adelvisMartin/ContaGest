# ADR · #106 Frontend Architecture de Control Hípico

- Estado: **Accepted / incremental**
- Producto: Control Hípico PWA/APK
- Entrada productiva: `frontend/public/hipico-control/index.html` → `assets/js/app.js`
- Principio: refactor progresivo, sin cambio de framework ni autoridad monetaria al frontend.

## Contexto

`assets/js/app.js` continúa concentrando shell, navegación, composición de vistas y parte de la orquestación. Sin embargo, el runtime ya contiene módulos de dominio reutilizables (`engine.js`, `store.js`, `sync.js`, `reports.js`, `workspace.js`, `supabase.js`, etc.). El objetivo de #106 no es reescribir la PWA: es establecer fronteras comprobables y mover superficies de alto cambio fuera de la orquestación principal preservando sus contratos públicos.

## Decisión

La arquitectura objetivo se organiza por responsabilidad:

```text
app.js                      composición / wiring temporal
│
├─ core                     config, auth local, errores/estado transversal
├─ workspace                shape, persistencia local, snapshots
├─ race                     cálculo, lifecycle, settlement
├─ participants             identidad operativa y saldos de presentación
├─ whatsapp                 parser, matching, adapters de mensajería
├─ reports                  formateo/exportación
├─ sync                     merge, nube, outbox/reconciliación
├─ navigation               rutas/estado de vista
└─ ui                       markup/primitives/feedback
```

No se exige mover todos los archivos en un solo PR. Cada extracción debe conservar la API consumida por `app.js`, tener caracterización antes/después y eliminar la lógica original duplicada.

## Migración material realizada en #106

La superficie de parsing WhatsApp deja de ser un archivo monolítico:

```text
app.js
  ↓ importa API estable
whatsapp.js                 fachada de compatibilidad
  ├─ whatsapp/parser.js     intención estructural: mensajes→offers→matches
  └─ whatsapp/normalization.js
                            normalización de remitentes, montos, pistas y jugadas
```

### Contrato preservado

`whatsapp.js` continúa exportando:

- `parseWhatsAppChat`;
- `matchChatOffers`;
- `normalizeChatPlay`;
- `participantMatchesSender`;
- `senderCode`;
- `generateClosureText`.

Por tanto `app.js` no cambia su import actual. La extracción está **conectada al flujo real** porque el mismo facade que ya consume la PWA reexporta el servicio nuevo.

Además se incorpora `createWhatsAppParser(defaultOptions)`, adapter inyectable para probar catálogo/gramática sin DOM, IndexedDB ni browser real.

## Responsabilidades actuales y destino

| Área | Fuente actual | Estado después de #106 | Próxima migración segura |
| --- | --- | --- | --- |
| core | `config.js`, `local-auth.js`, parte de `app.js` | parcial | estado async/errores |
| workspace | `workspace.js`, `store.js` | modular | separar adapter persistencia de view orchestration |
| race | `engine.js`, `race-state-machine.js`, `race-finalization.js`, `app.js` | parcial | view model de captura/carrera |
| participants | principalmente `app.js` + workspace | pendiente | service/view model sin mover saldo autoritativo al browser |
| whatsapp | facade + parser + normalization + Bridge | **migrado materialmente** | conversation engine/adapters por tickets #150+ |
| reports | `reports.js`, `format.js`, parte de `app.js` | parcial | view model/commands de export |
| sync | `sync.js`, `supabase.js`, `store.js`, parte de `app.js` | parcial | orchestrator inyectable después de caracterización de conflictos |
| navigation | `app.js` | pendiente | controller de navegación/back/modal |
| ui | `ui.js`, CSS canónico #104, markup en `app.js` | parcial | views pequeñas sin duplicar design system |

## Reglas de dependencia

1. `app.js` puede componer módulos, pero las reglas puras nuevas no deben depender del DOM.
2. parser/matching no accede a `document`, `window`, IndexedDB ni Supabase.
3. UI no se convierte en autoridad de saldo, liquidación o autorización.
4. adapters de red/persistencia se inyectan o se mantienen en módulos dedicados.
5. no se crean globals mutables nuevos.
6. una extracción sólo cuenta cuando el consumidor productivo usa el nuevo módulo.

## Compatibilidad PWA/APK

El wrapper Android copia recursivamente `frontend/public/hipico-control`; los submódulos `assets/js/whatsapp/*` forman parte del mismo runtime y entran en la comparación SHA-256 de `sync-web.mjs`. No existe una variante Android del parser.

## Testing

`tests/hipico_frontend_architecture_issue_106.test.mjs` caracteriza:

- resultado de la fachada vs servicio extraído;
- matching representativo de dos participantes;
- adapter inyectable sin browser globals;
- contratos públicos de normalización/remitentes/cierre;
- prohibición de volver a concentrar el parser en la fachada.

Los tests Hípico existentes continúan siendo la regresión funcional de parser/Bridge. Browser E2E sigue siendo evidencia superior cuando el runner esté disponible.

## Alternativas descartadas

### Reescribir toda la PWA en React/MUI

Descartado: no aporta valor proporcional y aumenta el blast radius. #104 ya definió el sistema visual propio de Control Hípico.

### Extraer navegación, sync, todas las views y parser en el mismo PR

Descartado: demasiado riesgo. Cambiar varios ejes de estado simultáneamente dificultaría atribuir regresiones.

### Mantener un segundo parser nuevo sin conectar

Descartado: sería scaffolding falso. La fachada productiva ahora delega realmente en los módulos extraídos.

## Rollback

La extracción no modifica persistencia ni schema. El rollback consiste en revertir los commits #106 y restaurar `whatsapp.js` monolítico; no requiere migración de datos.

## Deuda explícita

`app.js` sigue siendo grande. #106 no debe cerrarse como “modularización total”: esta PR establece el ADR y completa una primera extracción material con cobertura. Las siguientes olas deben priorizar navigation/sync/view models sólo después de caracterizar cada flujo.
