# 50/51 · QA — Contratos de componentes reutilizables

## Objetivo

Hacer fail-closed los contratos compartidos de UI para evitar que las rutas migradas vuelvan a crear variantes incompatibles de los mismos patrones.

## Componentes cubiertos

- `CgPageHeader`;
- `CgButton` / `CgIconButton`;
- `CgTextField`;
- `CgSelect`;
- `CgDialog`;
- `CgDataTable`;
- `CgEmptyState`;
- `CgState`.

## Contratos

- icon buttons requieren nombre accesible;
- fields/selects requieren label persistente;
- dialogs requieren título y `aria-labelledby`;
- headers de tabla conservan `scope=col`;
- empty/error states permanecen centralizados;
- las rutas Wave A no pueden declarar clones locales de los primitives;
- el sistema visual conserva `:focus-visible` y `prefers-reduced-motion: reduce`.

## Runtime

`qa/erp-component-contracts-v5051.spec.mjs` recorre Odontología, Veterinaria, Gimnasio, Rutinas y Nutrición y comprueba nombres accesibles, labels, IDs duplicados, foco navegable y reduced motion.

El spec está conectado al runner 58x5; no constituye una suite paralela.
