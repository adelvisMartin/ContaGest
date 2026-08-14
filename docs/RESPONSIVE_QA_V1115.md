# ContaGest-VE — Responsive QA v11.15

## Objetivo

Eliminar overflow global, solapamientos y controles no adaptativos en el shell y los módulos de ContaGest-VE, con énfasis en teléfonos de 360–430 px y en la coherencia Claro/Oscuro.

## Cambios bajo prueba

- shell móvil de dos filas;
- cuenta sin avatar/iniciales `AL`;
- menú de cuenta tipo bottom sheet en móvil;
- tema Claro/Oscuro en un click;
- quick navigation táctil sin flechas flotantes;
- KPI flexibles;
- grids de módulos colapsables;
- formularios de una columna;
- tablas con scroll interno;
- jerarquía tipográfica más sobria;
- prevención de overflow del documento.

## Suite automatizada

Archivo:

```text
qa/responsive-all-routes.spec.mjs
```

Rutas cubiertas: **55**.

Viewports de teléfono:

```text
360×800
390×844
430×932
```

Contratos por ruta:

```text
document.documentElement.scrollWidth <= innerWidth + 1
document.body.scrollWidth <= innerWidth + 1
sin elementos visibles fuera del viewport salvo wrappers con scroll intencional
```

Pruebas adicionales:

1. tema `light → dark → light` en un click por transición;
2. avatar/iniciales ocultos;
3. botón de cuenta abre `#userMenuPanel`;
4. `Empresa y configuración` navega a `module=configuracion`;
5. flechas `.hf-quick-arrow` ocultas en móvil;
6. quickbar con scroll táctil horizontal.

Total nominal: **168 casos** (`55 rutas × 3 viewports + 3 contratos de interacción`).

## Estado de ejecución en este entorno

### Build Vercel

**PASS** para el árbol funcional de la rama.

El deployment del commit `4163eef143be64f9cf60fb031f2864b5c3124aa2` terminó `READY` y Vercel reportó `Build Completed`.

Única advertencia observada: el repositorio fija Node `22.x` mientras la configuración del proyecto declara Node `24.x`; Vercel utiliza correctamente Node 22 por el `engines` del proyecto.

### Navegador contra Preview Vercel

**NO EJECUTADO / BLOQUEADO POR ENTORNO**.

Chromium en el runtime de automatización devuelve:

```text
net::ERR_BLOCKED_BY_ADMINISTRATOR
```

al navegar al dominio Preview externo. Esto no se registra como PASS ni como fallo de la aplicación: el navegador administrado impide llegar al host.

### Render QA local

Se utilizaron fixtures representativos en Chromium local a `390×844` para comprobar visualmente el contrato del nuevo sistema y que el propio fixture no produzca overflow horizontal. Estas imágenes son referencias del sistema implementado, **no sustituyen la ejecución de la suite contra la aplicación real**.

## Comando de validación requerido antes del merge

En un entorno con navegador y acceso al proyecto:

```bash
npm install
npx playwright install chromium
npm run test:browser -- qa/responsive-all-routes.spec.mjs
```

Para un Preview remoto se recomienda permitir que `playwright.config.mjs` reciba `QA_BASE_URL` en un cambio posterior o ejecutar la misma suite contra un checkout local de la rama.

## Gate de merge

No considerar esta iniciativa totalmente cerrada hasta obtener:

- 168/168 pruebas responsive/interacción en verde o hallazgos corregidos;
- revisión visual de Dashboard;
- Libro de Ventas;
- Ventas;
- Inventario;
- Contabilidad;
- Configuración;
- Perfil;
- tema Claro y Oscuro;
- menú móvil;
- tablet al menos `768×1024`;
- desktop al menos `1366×768`.

## Regla

`READY` de Vercel significa que el proyecto compiló y fue desplegado; **no significa que UX/UI haya pasado QA de navegador**.
