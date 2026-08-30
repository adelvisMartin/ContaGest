# ERP Mobile Foundation #180

## Alcance

Esta base define primitives reutilizables para 360–430 px sin migrar por sí sola las 58 rutas. La migración funcional pertenece a #181.

## Contrato

- mobile: 360×800, 390×844, 430×932;
- tablet: 768×1024;
- desktop: 1440×900;
- targets táctiles >=44 px;
- `body/document` no debe adquirir overflow horizontal por componentes de página;
- navegación horizontal sólo dentro de un owner explícito y accesible;
- grids colapsan a una columna cuando no existe ancho suficiente;
- formularios usan 16 px en inputs mobile para evitar zoom automático de iOS;
- action bars permiten wrap y opcionalmente sticky mobile;
- tablas anchas hacen scroll dentro de `CgSafeTable`, nunca ensanchando el documento.

## Primitives

`CgResponsivePage`, `CgResponsiveStack`, `CgResponsiveGrid`, `CgMetricGrid`, `CgMetricCard`, `CgMobileNav`, `CgActionBar`, `CgFormGrid`, `CgSafeTable`, `CgMobileEmptyState` y `CgNoBodyOverflowBoundary`.

## Uso

Las rutas deben importar desde `components/ui/cg/CgMobilePrimitives.jsx` y componer estos primitives sobre los `Cg*` existentes. No se debe copiar CSS page-by-page para resolver el mismo overflow.

## QA

#181 debe validar cada ruta en 360/390/430 y #182 debe repetir la verificación sobre el artefacto servido, no sólo source local.
