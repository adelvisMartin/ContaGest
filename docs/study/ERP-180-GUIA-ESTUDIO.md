# Guía de estudio — ERP #180

## Mobile-first

Diseñar primero para el ancho más restrictivo obliga a priorizar contenido y evita resolver mobile como un parche al final.

## Overflow owner

Una tabla o nav puede necesitar scroll horizontal. El problema no es el scroll en sí, sino que lo herede todo el documento. El componente que lo necesita debe ser su owner explícito.

## Touch target

Un control táctil pequeño es difícil de usar aunque visualmente se vea bien. El contrato usa 44×44 px como mínimo operativo.

## Grid responsive

En mobile una columna `minmax(0,1fr)` evita que texto/children impongan un ancho mayor. En tablet/desktop el grid puede distribuir varias columnas.

## Action bar

Las acciones no deben quedar pegadas, solapadas ni fuera de pantalla. Deben admitir wrap y, cuando la operación lo requiere, una variante sticky mobile.

## Formulario

Inputs a 16 px en mobile reducen el zoom automático de navegadores iOS. Labels persistentes y espacio suficiente siguen siendo obligatorios.

## Tabla segura

`CgSafeTable` crea una región scrollable accesible. No se intenta encoger una tabla compleja hasta volverla ilegible.

## Preguntas

1. ¿Qué diferencia existe entre overflow del body y overflow de una tabla?
2. ¿Por qué `minmax(0,1fr)` ayuda a prevenir desbordes?
3. ¿Por qué 44 px importa en touch?
4. ¿Cuándo conviene una action bar sticky?
5. ¿Por qué #180 no implica que las 58 rutas ya estén migradas?
