# Control Hípico — Style Guide canónica

**Estado:** vigente  
**Producto:** Control Hípico PWA + wrapper Android  
**Fuente visual:** `frontend/public/hipico-control/`  
**Owner:** frontend/UX de Control Hípico  
**Issue:** #104

Esta es la única referencia vigente para nuevas superficies de Control Hípico. El producto comparte disciplina de ingeniería con ContaGest, pero conserva identidad propia: consola operacional sobria, densa, rápida y orientada a jornadas hípicas. No se copia la estética del ERP ni se crea una segunda colección de primitives.

> `precision-hipica.css` y la antigua documentación `--ch-*` quedan como legado de iteraciones previas. El runtime vigente no la carga desde `index.html`. La API canónica es `--hc-*` + `components.css`.

## 1. Orden de capas

El runtime carga estilos en este orden:

1. `styles.css`: compatibilidad histórica y layout existente;
2. `tokens.css`: valores semánticos canónicos + aliases de transición;
3. `themes.css`: light/dark y preferencias del sistema;
4. `components.css`: contratos de primitives y estados;
5. `operations-pro.css`: composición específica del dominio.

Un nuevo componente debe consumir variables `--hc-*`. No se agregan nuevas primitives equivalentes en `styles.css`, `precision-hipica.css` ni hojas `hotfix/vXX`.

## 2. Tokens

### Color

Usar roles, no colores por apariencia: `--hc-bg`, `--hc-surface*`, `--hc-border*`, `--hc-text*`, `--hc-brand*`, `--hc-success*`, `--hc-warning*`, `--hc-danger*`, `--hc-info*`, `--hc-focus`.

- **brand:** acción principal e identidad;
- **success:** operación confirmada o saldo favorable;
- **warning:** offline, stale, riesgo o acción que necesita atención;
- **danger:** fallo, pérdida, reverso o acción destructiva;
- **info:** contexto/permiso sin semántica de éxito;
- el color nunca es la única señal de estado.

### Spacing y densidad

La escala es de 4 px: `--hc-space-1/2/3/4/5/6/8/10/12/16`. La consola puede ser densa, pero un control táctil interactivo no baja de `--hc-touch: 44px`. Para acciones primarias frecuentes se recomienda `--hc-touch-comfortable: 48px`.

### Radius y elevation

Usar `--hc-radius-xs/sm/md/lg/xl/pill` y `--hc-shadow-1/2/dialog`. La elevación representa jerarquía, no decoración.

### Tipo y números

Texto general: `--hc-font-sans`. Código, IDs o payload técnico: `--hc-font-mono`. Dinero, saldo, carrera, posición, pizarra y resultado usan `font-variant-numeric: tabular-nums lining-nums` mediante `.money`, `.amount`, `.balance`, `.result-number`, `.tabular-number` o atributos `data-money/data-balance/data-result`.

Nunca truncar una cifra monetaria crítica sin una forma visible de consultar el valor completo.

## 3. Primitives

La capa soportada es:

- `.button` + `--primary/--success/--danger/--ghost/--small/--xl`;
- `.icon-button` con nombre accesible obligatorio;
- `.field`, `.input`, `.select`, `.textarea`, `.field__hint`, `.field__error`;
- `.dialog`/`.modal` y `.drawer`;
- `.tabs`/`.tab`;
- `.badge` y estados semánticos;
- `.table-wrap`/`.summary-table`;
- `.list`/`.list__item`;
- `.card` y `.kpi`;
- `.ui-state` para estados transversales.

No crear `button2`, `new-card`, `modern-input`, otro modal o una primitive paralela para resolver una sola pantalla. Las variantes de dominio se componen sobre estas bases.

## 4. Estados obligatorios

Toda vista dependiente de datos async diseña explícitamente los estados que apliquen:

| Estado | Contrato |
| --- | --- |
| `loading` | progreso visible; no mostrar datos viejos como confirmados |
| `empty` | explicar qué falta y, si procede, ofrecer siguiente acción |
| `error` | causa útil + acción retry/recovery cuando exista |
| `offline` | indicar conectividad y limitar mutaciones no seguras |
| `stale` | mostrar `lastSyncedAt` o contexto equivalente; nunca aparentar live |
| `permission` | explicar falta de capacidad sin revelar datos prohibidos |
| `recovery` | ruta reversible, sin borrar storage ajeno |

Usar `.ui-state[data-state="..."]` como primitive transversal. Los estados monetarios siguen teniendo autoridad en backend/state machine; la UI sólo los representa.

## 5. Formularios

- label visible asociado al control; placeholder no reemplaza label;
- error cercano y `aria-invalid="true"` cuando aplique;
- no limpiar datos introducidos tras un error recuperable;
- teclado móvil apropiado (`inputmode`) para montos/números;
- Enter/submit no provoca doble mutación;
- acciones peligrosas requieren contexto y confirmación proporcional al riesgo.

## 6. Navegación y responsive

Breakpoints de QA obligatorios: **360, 390, 430, 768, 1366 y 1920 px**, además de landscape móvil/tablet.

- 360–430: ningún flujo depende de hover; acciones envuelven o usan ancho disponible;
- 431–768: conservar densidad sin comprimir un layout desktop;
- desktop: contenido respeta `--hc-content`; sidebar/topbar no tapan contenido;
- Android WebView/PWA respetan `safe-area-inset-*`;
- back del dispositivo cierra overlay/nivel de navegación antes de abandonar cuando corresponda.

Overflow horizontal sólo es aceptable dentro de contenedores explícitos de datos (`.table-wrap`, strips), nunca en `body`.

## 7. Focus, teclado y movimiento

Todo elemento interactivo tiene `:focus-visible` inequívoco. No retirar outline sin reemplazo. `prefers-reduced-motion: reduce` elimina movimiento no esencial; el comportamiento nunca depende de una animación.

## 8. Light/Dark

Ambos temas están soportados porque `themes.css` define `data-theme="light"` y `data-theme="dark"`. Una nueva primitive se valida en ambos. No introducir valores que sólo sean legibles en uno.

## 9. Do / Don't

**Do:** reutilizar primitive existente; usar tokens semánticos; probar etiquetas largas y cifras grandes/negativas; mantener alta densidad con jerarquía clara; hacer visible stale/offline; validar PWA y APK contra el mismo contrato.

**Don't:** copiar componentes de ContaGest sólo por apariencia; agregar otra librería UI; usar `!important` como arquitectura; esconder overflow globalmente para ocultar clipping; reducir targets táctiles; presentar datos stale como live; mezclar reglas monetarias en DOM/CSS.

## 10. Ownership y cambios

`tokens.css`, `themes.css` y `components.css` forman la API visual. Un cambio incompatible exige explicación en PR, búsqueda de consumidores, QA visual en viewports obligatorios, PWA↔APK parity y actualización de esta guía.

`styles.css` es capa histórica en migración. Puede mantenerse para no romper la RC, pero no recibe nuevas primitives equivalentes. `precision-hipica.css` no es fuente canónica y no debe volver a cargarse como una segunda arquitectura visual.

## 11. Piloto #104

La primera migración normaliza de forma compatible tres superficies existentes mediante la capa canónica:

- autenticación (`.auth-card` y controles);
- workspace/navegación (`.sidebar`, `.topbar`, `.nav-button`);
- operación de carrera (`.card`, `.race-card`, `.quick-action`, `.risk-card`, `.bet-card`, cifras y acciones).

La compatibilidad de clases permite continuar vista a vista en #105/#106 sin reescritura masiva.

## 12. Checklist de revisión

Un cambio visual sólo está listo si: usa primitive/token canónico; target táctil >=44 px; focus visible; labels largos no rompen composición; cifras usan tabular nums; estados async están definidos; no hay overflow global a 360/390/430/768/desktop; light/dark y reduced-motion no pierden información; PWA/APK consumen el mismo runtime visual.
