# ContaGest VE · Iteración visual exhaustiva por módulo · v12

Este documento convierte la revisión visual en un proceso repetible por **cada ruta real del ERP**, no únicamente por Dashboard. La fuente ejecutable del inventario es `qa/support/module-visual-catalog.mjs` y debe permanecer sincronizada con `pageRegistry` de `frontend/src/app.js`.

## Estado de evidencia

- `SOURCE REVIEWED`: se revisó el código del módulo o su familia y existe una regla/contrato concreto.
- `AUTOMATED MATRIX`: el módulo forma parte de la matriz Playwright profunda.
- `BROWSER PENDING`: el test está escrito pero todavía debe ejecutarse en un runtime con Playwright.
- `MANUAL PENDING`: requiere además observación humana porque una prueba geométrica no evalúa por completo jerarquía, claridad o densidad.

No usar `PASS` hasta ejecutar realmente los tests.

## Ciclo de seis iteraciones

Cada módulo pasa por el mismo ciclo:

1. **A · Source/ownership** — imports del UI kit, CSS propio, estilos inline, componentes duplicados, iconografía, tablas/forms raw y selectores legacy.
2. **B · Desktop 1440/1024** — jerarquía, primer viewport, KPI, tablas, formularios, acciones, cards, alineación y overflow.
3. **C · Tablet 768** — colapso de columnas, drawer, tablas, filtros, acciones y campos.
4. **D · Mobile 430/390/360** — cero overflow del documento, touch targets, nowrap monetario, botones y labels sin colisión.
5. **E · Theme/state** — light/dark sin cambio geométrico, empty/one/many, textos largos, loading/error/disabled, foco y reduced motion.
6. **F · Cleanup** — retirar CSS/markup supersedido y comprobar colisiones de selectores/tokens antes de introducir otro override.

## Matriz por módulos

| Ruta | Familia | Riesgo | Revisión principal | Estado actual |
|---|---|---:|---|---|
| `dashboard` | Core | crítico | KPI, primer viewport, flujo mensual, acciones rápidas, tablas | SOURCE REVIEWED · AUTOMATED MATRIX · BROWSER PENDING |
| `cotizacion` | Comercial | alto | formulario de cotización, líneas, totales VES/USD, acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `clientes` | Comercial | alto | formularios largos, RIF, tablas y acciones por fila | AUTOMATED MATRIX · BROWSER PENDING |
| `ventas` | Comercial | crítico | KPI, alta de venta, tabla 8+ columnas, acciones icon-only | SOURCE REVIEWED · AUTOMATED MATRIX · BROWSER PENDING |
| `inventario` | Operaciones | crítico | tabla 10 columnas, SKU/nombres largos, stock/badges, importes | SOURCE REVIEWED · AUTOMATED MATRIX · BROWSER PENDING |
| `tributos` | Contabilidad | crítico | montos fiscales, formularios, tablas y estados | AUTOMATED MATRIX · BROWSER PENDING |
| `normativa` | Contabilidad | medio | lectura densa, filtros, estados/alertas | AUTOMATED MATRIX · BROWSER PENDING |
| `historial` | Operaciones | alto | listas largas, filtros, fechas, acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `reportes` | Reporting | alto | tablas/gráficos, filtros, exportación, densidad | AUTOMATED MATRIX · BROWSER PENDING |
| `contabilidad` | Contabilidad | crítico | libro diario, preview, tabla ancha, captura contable | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `libro-mayor` | Contabilidad | crítico | cuentas, saldos, jerarquía numérica, tabla ancha | AUTOMATED MATRIX · BROWSER PENDING |
| `balance-sumas-saldos` | Contabilidad | crítico | columnas de debe/haber/saldos, totalización | AUTOMATED MATRIX · BROWSER PENDING |
| `hoja-trabajo` | Contabilidad | crítico | tabla financiera muy ancha, sticky context | AUTOMATED MATRIX · BROWSER PENDING |
| `estados-financieros` | Contabilidad | crítico | jerarquía de rubros, importes y comparativos | AUTOMATED MATRIX · BROWSER PENDING |
| `cierre-contable` | Contabilidad | crítico | acciones irreversibles, estados y advertencias | AUTOMATED MATRIX · BROWSER PENDING |
| `bancos` | Finanzas | crítico | saldos, conciliación, tablas, moneda | AUTOMATED MATRIX · BROWSER PENDING |
| `nomina` | RRHH | crítico | recibos, empleados, montos y tablas densas | AUTOMATED MATRIX · BROWSER PENDING |
| `proveedores` | Comercial | alto | formularios/RIF, pagos y tabla | AUTOMATED MATRIX · BROWSER PENDING |
| `compras` | Comercial | crítico | captura, totales, impuestos, tabla y acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `auditoria` | Gobierno | crítico | bitácora densa, estados, filtros, legibilidad | AUTOMATED MATRIX · BROWSER PENDING |
| `configuracion` | Admin | alto | formularios extensos, tabs/secciones, theme | SOURCE REVIEWED · AUTOMATED MATRIX · BROWSER PENDING |
| `ayuda` | Soporte | medio | lectura, navegación y acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `tasks` | Operaciones | medio | listas/estados, acciones y filtros | AUTOMATED MATRIX · BROWSER PENDING |
| `profile` | Admin | medio | formularios de cuenta, avatar, controles | AUTOMATED MATRIX · BROWSER PENDING |
| `mobile` | Admin | medio | preview, escala y contención | AUTOMATED MATRIX · BROWSER PENDING |
| `libro-ventas` | Contabilidad | crítico | libro fiscal, tabla y montos | AUTOMATED MATRIX · BROWSER PENDING |
| `marca` | Admin | bajo | assets, logo, tokens; evitar estilos que muten runtime | AUTOMATED MATRIX · BROWSER PENDING |
| `admin` | Admin/RBAC | crítico | permisos, tablas editables, checkbox grids, demos | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `backend` | Admin | alto | endpoints/status, código/mono, tablas y controles | AUTOMATED MATRIX · BROWSER PENDING |
| `vistas` | Admin | medio | catálogo, densidad de cards y navegación | AUTOMATED MATRIX · BROWSER PENDING |
| `plan-cuentas` | Contabilidad | crítico | árbol/códigos de cuenta, indentación, tabla | AUTOMATED MATRIX · BROWSER PENDING |
| `rrhh` | RRHH | alto | personal, estados, cards/tablas | AUTOMATED MATRIX · BROWSER PENDING |
| `analytics` | Reporting | alto | gráficos, etiquetas, filtros, KPI | AUTOMATED MATRIX · BROWSER PENDING |
| `qr` | Operaciones | medio | scanner/QR, cámara/preview, acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `inventario-scan` | Operaciones | alto | cámara/lector, producto encontrado, touch | AUTOMATED MATRIX · BROWSER PENDING |
| `pedidos` | Food | alto | kanban horizontal intencional, cards, estados | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `pos-sede` | Food/POS | crítico | touch targets, productos, carrito, totales, responsive | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `tracking-pedidos` | Food | alto | status/progress y contenido largo | AUTOMATED MATRIX · BROWSER PENDING |
| `delivery-mapa` | Food | alto | mapa/paneles, overflow y acciones | AUTOMATED MATRIX · BROWSER PENDING |
| `asistente-ia` | Soporte | medio | conversación, input fijo, mensajes largos | AUTOMATED MATRIX · BROWSER PENDING |
| `soporte` | Soporte | medio | CTA, formularios y estados | AUTOMATED MATRIX · BROWSER PENDING |
| `demo-control` | Gobierno | medio | controles de demo y estados | AUTOMATED MATRIX · BROWSER PENDING |
| `modulos-madurez` | Gobierno | medio | tabla/matriz de madurez y badges | AUTOMATED MATRIX · BROWSER PENDING |
| `reglas-negocio` | Gobierno | alto | reglas, filtros y edición | AUTOMATED MATRIX · BROWSER PENDING |
| `licencias` | Gobierno | alto | estado, dispositivos, acciones sensibles | AUTOMATED MATRIX · BROWSER PENDING |
| `importacion-data` | Operaciones | alto | dropzone, mapping, errores y tablas | AUTOMATED MATRIX · BROWSER PENDING |
| `kardex` | Operaciones | crítico | muchas columnas, fechas, movimientos y montos | AUTOMATED MATRIX · BROWSER PENDING |
| `normativa-contable` | Contabilidad | alto | lectura técnica, tablas y navegación | AUTOMATED MATRIX · BROWSER PENDING |
| `pretesting` | Gobierno | medio | estados de QA, tablas/alertas | AUTOMATED MATRIX · BROWSER PENDING |
| `salud` | Salud | alto | grid clínica, expedientes, raw forms/table, agenda | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `veterinaria` | Salud/MUI | crítico | React/MUI, dialogs, tablas, safe areas, paridad visual | SOURCE REVIEWED · AUTOMATED MATRIX · BROWSER PENDING |
| `psicologia` | Salud | crítico | formularios, agenda, recordatorios, acciones externas | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `odontologia` | Salud | crítico | odontograma touch, forms, tratamientos, grids | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `gimnasio` | Fitness | alto | tabs, cards/forms propios, listas, contenido largo | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `rutinas` | Fitness | alto | misma runtime Gym, contenido y cards de seguimiento | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `nutricion` | Fitness | alto | misma runtime Gym, formularios/planes/listas | SOURCE REVIEWED · MODULE ADAPTER · AUTOMATED MATRIX · BROWSER PENDING |
| `mensajes` | Soporte | alto | templates, texto largo, textarea y acciones | AUTOMATED MATRIX · BROWSER PENDING |

## Problemas estructurales encontrados durante la revisión de fuente

### 1. Demasiadas generaciones de CSS siguen presentes

`erp-system.css` todavía importa una colección grande bajo `styles/legacy/`: shell, header, enterprise refinements, compact density, themes, login y responsive históricos. Además existen varios *compatibility shims* de 76 bytes en `styles/`. No todos son un error, pero aumentan el espacio de colisión y hacen difícil saber quién posee una regla.

**Medida:** `scripts/visual-system-audit.mjs` construye el grafo de `@import` desde `erp-runtime.css`, separa CSS activo/inactivo, calcula hashes y reporta duplicados, selectores idénticos y custom properties redefinidas.

### 2. El runtime todavía conserva nombres de temas retirados

El store ya normaliza el estado a `light|dark`, pero existen ramas/selectores históricos de `sector`, `enterprise`, `executive`, `finance`, `sky`, `soft-blue`, `spectrum`, `ocean`, `forest` y `celestial`. Aunque varios están inalcanzables desde la configuración oficial, son deuda de cascada.

**Medida:** mantener Light/Dark como contrato y eliminar progresivamente el CSS y toggles legacy sólo cuando el audit + browser matrix prueben que no existe consumidor real.

### 3. Contabilidad usa mezcla de UI canónica + utilidades/markup legacy

`LedgerPage` usa UI kit pero conserva wrappers `surface`, `panel-soft`, utilities de radius/padding, botones raw y tablas/preview específicos. El HTML de impresión incluye un `<style>` propio que es correcto para el documento exportado pero debe diferenciarse del runtime para evitar falsos positivos del auditor.

**Medida:** `module-adapters.css` normaliza workbench, cards, preview, KPI y scroll. La siguiente migración de código debe reemplazar botones raw y separar explícitamente estilos `print-only`.

### 4. Admin/RBAC es una superficie de alto riesgo de solapamiento

Tiene tablas editables, permisos por checkbox, formularios demo, badges, inputs inline y acciones pequeñas. Varias piezas aún usan `pl-table`, `btn` y clases `cg-rbac-*` propias.

**Medida:** adapter de grid/permission pills/forms/table overflow y matriz móvil crítica.

### 5. Salud tiene dos generaciones de interfaz

`HealthcarePage` contiene lógica humana y una rama `animal`, pero la ruta real `veterinaria` carga `VeterinaryClinicPageV1123.jsx`. Eso deja una rama veterinaria legacy que debe considerarse duplicación funcional/visual hasta confirmar que ningún flujo la utiliza.

**Medida:** no eliminarla a ciegas; añadirla al inventario de deuda y retirar sólo después de caracterizar imports/uso y probar Veterinaria real.

### 6. Fitness posee un mini design system propio

`GymManagementPage` utiliza muchas clases `cg-gym-v1124-*`, formularios y botones raw y hasta estilos inline históricos. Esto es precisamente el tipo de módulo que puede verse distinto aunque el shell sea correcto.

**Medida:** adapter tokenizado + fuente auditada; migración progresiva a `components/ui` después de validar operaciones.

### 7. POS/Pedidos requieren densidad diferente, no diseño diferente

`FastFoodPosPage` y `FoodOrdersPage` usan elementos raw y clases propias. El POS necesita objetivos táctiles; Pedidos necesita un kanban cuyo overflow horizontal **sí es intencional**. Ocultar todo overflow globalmente sería un error.

**Medida:** el adapter convierte únicamente esos contenedores en dueños explícitos de scroll y normaliza cards/touch targets/totales.

### 8. Tailwind/utilities y componentes canónicos aún conviven

Algunos módulos incluyen clases como `grid`, `md:grid-cols-*`, `rounded-[...]`, `p-*`, `!p-*` junto al UI kit. Esto no implica un bug automáticamente, pero hace que dos sistemas decidan geometría.

**Medida:** el source audit las prioriza para migración; Visual System v12 y module adapters deben ser la autoridad final de geometría.

## Artefactos de auditoría

Ejecutar:

```bash
npm run audit:visual
```

Genera:

```text
artifacts/qa/visual-source-audit.md
artifacts/qa/visual-source-audit.json
```

El JSON conserva todos los módulos, hallazgos por severidad, CSS activo/inactivo, hashes, duplicados, colisiones de selector y colisiones de tokens.

## Browser matrix

Base:

```bash
npm run test:browser:visual
```

Iteración profunda:

```bash
npm run test:browser:visual:deep
```

La profunda recorre todas las rutas a 768/1024/1440 y las rutas críticas a 360/390/430. Busca overflow, viewport escape, title/KPI size, pseudo-blobs, field/action overlap, controles bajos, botones recortados, tablas sin scroll owner y drift geométrico Light/Dark.

En Windows, ejecutar todo junto:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

## Orden de corrección cuando aparezcan fallos

1. Resolver ownership/cascade, no elevar `z-index` al azar.
2. Corregir primitive/token compartido si afecta múltiples módulos.
3. Usar `module-adapters.css` sólo para estructura legacy temporal.
4. Corregir la página si el problema es verdaderamente de dominio.
5. Añadir fixture/test de regresión.
6. Retirar el selector viejo que ya no tiene consumidor.
7. Repetir audit → static contract → browser base → browser deep.

El objetivo final no es acumular overrides: es que `module-adapters.css` disminuya con cada migración hasta quedar reducido a las diferencias genuinamente específicas de dominio.
