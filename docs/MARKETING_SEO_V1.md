# ContaGest — Arquitectura Marketing / SEO v1

## Objetivo

Separar la aplicación privada autenticada de la superficie comercial indexable sin romper las URLs existentes del ERP.

## Frontera pública / privada

### Aplicación privada

- Entrada: `/`
- Navegación interna: `/?module=<ruta>` mediante `UrlStateService`.
- Login: `/?module=login`.
- Política SEO: `noindex,nofollow,noarchive,nosnippet` en HTML y `X-Robots-Tag` para la entrada privada.
- APIs: `X-Robots-Tag: noindex`.
- La app privada no aparece en `sitemap.xml`.

No se usa `Disallow: /` en `robots.txt`, porque bloquear el crawling de toda la raíz impediría que los robots puedan observar el `noindex` de la app y también bloquearía `/soluciones/`.

### Sitio comercial público

Entradas físicas generadas por Vite multi-page:

- `/soluciones/`
- `/soluciones/comercios/`
- `/soluciones/contadores/`
- `/soluciones/salud-veterinaria/`
- `/soluciones/gimnasios/`
- `/soluciones/multiempresa/`

Cada página posee:

- `title` y description propios;
- `index,follow`;
- canonical explícito;
- Open Graph / Twitter básicos;
- JSON-LD válido y sin ratings/testimonios inventados;
- CTA demo;
- CTA WhatsApp únicamente cuando hay número comercial real configurado;
- navegación semántica, skip link, foco visible y responsive.

## Fuentes de verdad comerciales

- Claims: `docs/MARKETING_CLAIMS_REGISTER.md`
- Pricing: `docs/COMMERCIAL_PRICING_V1.md`
- Assets: `/icons/contagest-app.svg` y `/brand/contagest-logo.svg`

Una capacidad existente en código no debe presentarse automáticamente como activa en todos los ambientes. Cuando dependa de proveedor/configuración/despliegue se etiqueta como Condicional o Planificado hasta verificar el ambiente promocionado.

## Pricing

Los precios expuestos son **referencias comerciales v1**, no contratos hardcodeados:

- Profesional: USD 19/mes
- Vendedor / Comercio: USD 22/mes
- PyME Integral: USD 32/mes
- Contador Multiempresa: USD 45/mes
- RIF adicional Contador: referencia USD 12/mes
- Vertical especializada: referencia USD 10–20/mes sobre plan base compatible

`Subscription.amount`, ciclo y límites siguen siendo la fuente contractual real.

## CTA y variables públicas

Variables Vite permitidas:

```text
VITE_MARKETING_WHATSAPP_NUMBER=
VITE_MARKETING_WHATSAPP_MESSAGE=Hola, quiero conocer ContaGest y solicitar una demo.
VITE_MARKETING_DEMO_URL=/?module=login
```

Estas variables son públicas por diseño; nunca colocar en ellas tokens, claves API o secretos.

Si `VITE_MARKETING_WHATSAPP_NUMBER` está vacío o no contiene entre 8 y 15 dígitos, el botón de WhatsApp se oculta. No existe teléfono ficticio de fallback.

## Canonical y dominio

La versión inicial usa como canonical:

`https://conta-gest-frontend.vercel.app`

Cuando exista un dominio comercial definitivo, cambiar **en el mismo release**:

1. canonical de las seis páginas;
2. `og:url`;
3. URLs JSON-LD;
4. `frontend/public/sitemap.xml`;
5. línea Sitemap de `frontend/public/robots.txt`.

No publicar simultáneamente dos dominios como canonical.

## Claims prohibidos

No publicar sin evidencia:

- inhackeable / 100% seguro / seguridad blindada;
- cifrado end-to-end de toda la aplicación;
- cumplimiento fiscal garantizado / 100% SENIAT;
- SENIAT en tiempo real como capacidad activa universal;
- conciliación automática con todos los bancos;
- HIPAA/GDPR/ISO/SOC 2;
- soporte 24/7 sin SLA;
- testimonios, ratings, número de clientes, ahorros o resultados inventados.

## Structured data

La portada usa:

- `SoftwareApplication`
- `FAQPage`

Las verticales usan:

- `SoftwareApplication`
- `BreadcrumbList`

No se añade `Review`, `AggregateRating` ni métricas comerciales sin evidencia.

## Responsive y accesibilidad

La hoja pública `frontend/src/marketing/marketing.css` es independiente del ERP privado para que marketing pueda tener una composición editorial sin alterar el sistema visual operativo.

Cobertura mínima prevista:

- 320/360/390/414 px
- 768 px
- 1024 px
- 1440 px

Controles táctiles de navegación >= 44 px, skip link, `:focus-visible`, semántica de headings, `prefers-reduced-motion` y navegación mobile sin dependencia de framework adicional.

## QA de release

Antes de publicar marketing:

1. validar que `/` y `/?module=login` siguen entregando `noindex`;
2. validar que `/soluciones/` y cinco verticales entregan `index,follow`;
3. validar canonical de cada página;
4. validar JSON-LD;
5. comprobar `robots.txt` y `sitemap.xml`;
6. comprobar que sitemap no contiene rutas privadas;
7. ejecutar `tests/marketing_seo_issue_25.test.mjs`;
8. ejecutar build completo;
9. QA visual mobile/tablet/desktop;
10. revisar claims contra `MARKETING_CLAIMS_REGISTER.md`;
11. verificar CTA demo y, si se configura, CTA WhatsApp real;
12. comprobar que no se publicaron credenciales de demo/admin.

## Rollback

Revertir el PR del Issue #25 restaura la SPA anterior. No hay migraciones ni cambios de base de datos asociados a este ticket.
