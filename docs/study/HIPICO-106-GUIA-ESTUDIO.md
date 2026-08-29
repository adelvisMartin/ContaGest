# Guía de estudio · #106 Arquitectura frontend de Control Hípico

## Idea central

Modularizar no significa crear más archivos. Significa que una responsabilidad puede cambiarse, probarse y entenderse sin tener que tocar partes no relacionadas.

Antes de #106, `whatsapp.js` mezclaba en un único archivo:

- normalización de texto;
- fechas y teléfonos;
- detección de hipódromos;
- montos y jugadas;
- parsing de mensajes;
- clasificación;
- detección de duplicados;
- matching juega↔consigue;
- helpers de participantes;
- mensaje de cierre.

Después de la primera migración:

```text
whatsapp.js
   │ fachada estable
   ├── whatsapp/normalization.js
   └── whatsapp/parser.js
```

El consumidor productivo (`app.js`) sigue importando `whatsapp.js`, por eso el refactor cambia estructura sin cambiar el contrato observable.

## Conceptos que debes dominar

### 1. Cohesión

Un módulo tiene alta cohesión cuando sus funciones pertenecen al mismo propósito. Normalizar teléfonos y detectar hipódromos encaja en una capa de normalización; renderizar un modal no.

### 2. Acoplamiento

Dos piezas están acopladas cuando cambiar una obliga a cambiar la otra. El parser nuevo no usa DOM, IndexedDB ni Supabase, así que puede evolucionar con menos dependencias.

### 3. Fachada de compatibilidad

Una fachada mantiene una API estable mientras la implementación interna cambia. Es útil en refactors incrementales porque evita modificar todos los consumidores en el mismo commit.

### 4. Dependency injection

`createWhatsAppParser()` recibe opciones externas en vez de leer estado global. Esto permite probar diferentes catálogos de hipódromos sin montar toda la app.

### 5. Caracterización

Antes de cambiar una implementación importante se captura qué hace hoy. El test compara `parseWhatsAppChat` desde la fachada con el servicio extraído y exige el mismo resultado.

### 6. Anti-scaffolding

Un archivo nuevo que nadie importa no es arquitectura implementada. En #106 el nuevo parser está conectado porque `whatsapp.js` lo reexporta y `app.js` ya consume esa fachada.

## Recorrido real

```text
usuario pega chat
      ↓
app.js
      ↓
parseWhatsAppChat (whatsapp.js)
      ↓
whatsapp/parser.js
      ↓
normalization.js
      ↓
offers / matches / replies / boards
      ↓
app.js revisa/importa resultados
```

## Por qué no se reescribió `app.js` completo

Un refactor masivo cambia navegación, estado, sync, formularios y UI al mismo tiempo. Si algo falla, es difícil saber dónde. Una estrategia senior reduce el blast radius y extrae una frontera a la vez con pruebas.

## Qué estudiar en el repositorio

1. `docs/hipico/ADR-FRONTEND-ARCHITECTURE-106.md` — mapa objetivo.
2. `assets/js/whatsapp.js` — fachada pública.
3. `assets/js/whatsapp/normalization.js` — primitives puras.
4. `assets/js/whatsapp/parser.js` — servicio de dominio frontend.
5. `tests/hipico_frontend_architecture_issue_106.test.mjs` — caracterización y contratos.
6. `assets/js/app.js` — identifica las próximas responsabilidades a extraer, sin hacerlo todo de una vez.

## Preguntas de repaso

1. ¿Cuál es la diferencia entre “muchos archivos” y modularidad real?
2. ¿Por qué una fachada ayuda a preservar backward compatibility?
3. ¿Qué gana el parser al no depender del DOM?
4. ¿Qué significa que una extracción esté conectada al runtime?
5. ¿Por qué la navegación y el sync no se extrajeron simultáneamente en esta primera ola?
6. ¿Qué tipo de prueba protege mejor un refactor: una que mira nombres de archivos o una que compara comportamiento?
7. ¿Dónde debe vivir la autoridad monetaria: en este parser o en backend/dominio?

## Ejercicio

Agrega un hipódromo sintético al `racetrackCatalog` mediante `createWhatsAppParser`, crea dos mensajes compatibles y comprueba que el matching conserve importe, pista, remitentes y `segmentId`. Hazlo en una rama de práctica, no en producción.
