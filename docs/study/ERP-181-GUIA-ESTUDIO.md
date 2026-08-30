# Guía de estudio — ERP #181

## Problema que resuelve

Una foundation de diseño no cambia automáticamente pantallas legacy. #181 conecta la foundation responsive con el runtime que realmente renderiza las 58 rutas.

## Shared adapter

`app.js` marca cada sección con `.cgx-module-standard`. El layer `cg.visual.responsive` usa esa frontera común para evitar copiar reglas en cada página.

## Primera ola

Gimnasio, rutinas y nutrición comparten `GymManagementPage.js`; inventario usa `InventoryPage.js`. Por eso arreglar el owner compartido produce más valor que crear tres versiones del mismo CSS.

## Overflow

El documento no debe desplazarse horizontalmente. Sólo tablas y navs que lo necesitan tienen `overflow-x:auto` y se vuelven regiones responsables de su propio contenido ancho.

## Iconos y texto

Un botón con icono debe reservar separación explícita. La ausencia de gap puede verse como icono “pegado” aunque no exista solapamiento geométrico.

## QA real

Leer CSS no prueba responsive. La suite abre las 58 rutas a 360, 390 y 430 y mide geometría/touch targets.

## Preguntas

1. ¿Por qué #180 no corrigió automáticamente las páginas legacy?
2. ¿Qué ventaja tiene un adapter compartido?
3. ¿Por qué gimnasio/nutrición/rutinas deben evaluarse juntos?
4. ¿Qué elementos pueden ser owners legítimos de overflow horizontal?
5. ¿Por qué la suite necesita navegador real?
