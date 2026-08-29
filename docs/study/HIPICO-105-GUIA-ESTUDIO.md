# Guía de estudio · #105 QA visual/funcional de Control Hípico

## Qué problema resuelve

Una aplicación puede compilar y aun así ser incómoda o inutilizable en un teléfono. Un smoke global suele pasar aunque una pantalla concreta tenga un botón tapado, texto recortado, scroll horizontal accidental o un control visible que no ejecuta nada.

#105 cambia la unidad de QA: **cada vista + cada viewport + cada estado es una prueba independiente**.

## Conceptos clave

### 1. Viewport no es dispositivo

El viewport es el área CSS disponible para la página. Probar 360, 390 y 430 px permite reproducir gran parte de los problemas de composición móvil sin depender primero de un teléfono físico.

### 2. Overflow

Hay dos clases importantes:

- **válido:** una tabla o tira de carreras decide ser horizontalmente desplazable;
- **defecto:** `body` o un contenedor normal mide más que la pantalla y obliga a mover toda la app lateralmente.

La regla del proyecto es que el documento no sea dueño del overflow horizontal.

### 3. Solapamiento

No basta con revisar CSS. El test toma los rectángulos reales que el navegador calculó (`getBoundingClientRect`) y comprueba si el icono invade el área del texto.

### 4. Touch target

Un control móvil puede verse bonito pero ser difícil de pulsar. La guía canónica exige aproximadamente 44 px de altura táctil. Por eso #105 trata tamaños menores como findings en geometrías touch.

### 5. Fixture representativo

Un fixture es un conjunto de datos preparado para probar una condición. Los fixtures de #105 incluyen nombres largos, cantidades grandes, valores negativos, varios grupos y colecciones vacías. Así se evita probar sólo el caso “bonito”.

### 6. Evidencia por SHA

El SHA identifica exactamente el commit probado. Una captura sin SHA puede pertenecer a otra versión y no demuestra nada sobre el candidato actual.

## Flujo mental del gate

```text
commit candidato
      ↓
fixture controlado
      ↓
abrir vista real
      ↓
render Chromium
      ↓
medir geometría + runtime errors
      ↓
captura ligada al SHA
      ↓
PASS / FAIL / BLOCKED
```

## Qué debes aprender revisando el código

1. Abre `qa/support/hipico-visual-catalog-v105.mjs` y observa cómo se separan vistas, viewports y datos.
2. Abre `qa/support/hipico-layout-detector-v105.mjs` y estudia cómo el navegador mide overflow y colisiones.
3. Abre `qa/hipico-visual-functional-v105.spec.mjs` y sigue el recorrido IndexedDB → navegación → render → assertions → screenshot.
4. Abre `android/hipico-control-v1130/scripts/sync-web.mjs` y observa por qué PWA/APK comparten la misma fuente visual.
5. Ejecuta el fixture roto y entiende por qué un buen test debe demostrar que también sabe fallar.

## Preguntas de repaso

1. ¿Por qué un build PASS no prueba que una pantalla móvil sea usable?
2. ¿Cuándo el overflow horizontal es válido?
3. ¿Por qué 44 px es una regla de interacción y no sólo estética?
4. ¿Qué problema evita ligar screenshots al SHA?
5. ¿Por qué PWA↔APK parity no sustituye un test físico de Android?
6. ¿Qué diferencia existe entre `FAIL` y `BLOCKED`?
7. ¿Qué ventaja tiene un fixture con nombres y cantidades extremas?

## Ejercicio recomendado

Introduce temporalmente una anchura fija de 600 px en un control móvil dentro de una rama de prueba, ejecuta `npm run test:browser:hipico`, identifica el finding y revierte el cambio. Nunca hagas este experimento contra `main` ni contra datos reales.
