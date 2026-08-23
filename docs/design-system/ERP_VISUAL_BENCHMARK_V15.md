# ContaGest VE · ERP Visual Benchmark v15

## Propósito

Este documento traduce referencias contemporáneas de dashboards ERP, SaaS, finanzas y salud en **reglas propias de ContaGest**. Las referencias se estudian para extraer patrones de jerarquía, navegación, densidad, theming y composición. No se copian logos, assets ni diseños pixel a pixel.

## Referencias estudiadas

- Dribbble · Sidebar Navigation Dashboard UI Component — Farhad Ahmed  
  https://dribbble.com/shots/27658782-Sidebar-Navigation-Dashboard-UI-Component
- Dribbble · Dashboard Sidebar UI — Light & Dark Mode — Faris  
  https://dribbble.com/shots/26359518-Dashboard-Sidebar-UI-Light-Dark-Mode
- Dribbble · Modern Minimalist Dashboard Sidebar (Light & Dark)  
  https://dribbble.com/shots/27233286-Modern-Minimalist-Dashboard-Sidebar-Light-Dark-UI-Concept
- Dribbble · Sleek & Intuitive SaaS Dashboard UI  
  https://dribbble.com/shots/25793491-Sleek-Intuitive-SaaS-Dashboard-UI
- Dribbble · ERP Dashboard — Dark UI Concept  
  https://dribbble.com/shots/27283795-ERP-Dashboard-Dark-UI-Concept
- Dribbble · Modern Admin Dashboard Design · Finance & Analytics  
  https://dribbble.com/shots/27098486-Modern-Admin-Dashboard-Design-Finance-Analytics-UI
- Dribbble · Mediso Healthcare Dashboard · Light & Dark Mode  
  https://dribbble.com/shots/27192526-Mediso-Healthcare-Dashboard-UI-Light-Dark-Mode-Admin-Panel
- Referencia proporcionada para perfil/admin + calendario  
  https://dribbble.com/shots/24457647-User-profile-Admin-panel
- Referencia proporcionada para sidebar  
  https://dribbble.com/shots/23370518-Web-Sidebar-Menu
- Referencia proporcionada para settings sidebar  
  https://dribbble.com/shots/25040431-Settings-sidebar-menu

## Hallazgos repetidos

### 1. La navegación debe reducir carga cognitiva

Los mejores ejemplos no muestran todo el producto al mismo nivel. Agrupan dominios, mantienen un conjunto pequeño de accesos primarios y reservan settings/profile para el fondo del sidebar.

**Decisión ContaGest:**

- sidebar 244 px;
- rail colapsado 68 px;
- Dashboard, Ventas, Inventario, Contabilidad y Reportes como accesos principales;
- sólo el grupo del dominio activo se expande;
- Configuración/Ayuda y cuenta de usuario viven abajo;
- `Ctrl K` abre búsqueda de módulos/acciones.

### 2. El estado activo no necesita un bloque azul enorme

La selección en herramientas de productividad suele utilizar fondo neutral, borde/indicador de marca y contraste tipográfico.

**Decisión ContaGest:** superficie activa neutral + indicador lateral de 2 px + icono con brand-soft. El azul saturado se reserva principalmente para CTA primaria.

### 3. Light y Dark deben ser el mismo producto

Las referencias más coherentes mantienen posiciones, tamaños y jerarquía al cambiar de tema.

**Decisión ContaGest:** light/dark comparten exactamente geometría, type scale y componentes.

Light:

```text
Canvas   #F4F5F7
Surface  #FFFFFF
Text     #17191D
Brand    #5661E8
```

Dark:

```text
Canvas   #111214
Surface  #181A1D
Text     #F4F5F7
Brand    #7C86FF
```

### 4. Un ERP necesita densidad controlada, no escala de landing page

Los dashboards financieros y enterprise reservan tipografía grande para identidad/marketing, no para cada valor operacional.

**Decisión ContaGest:**

| Rol | Escala |
|---|---:|
| Page title | 20–24 px |
| Section | 15–17 px |
| Body / field | 12–13 px |
| KPI / amount | 16–20 px |
| Label / table meta | 9–11 px |

Moneda, RIF y documentos utilizan números tabulares y no se elipsizan.

### 5. Las cards deben separar información, no decorar

**Decisión ContaGest:** 1 px border, 10–12 px radius, sombra mínima. Sin gradients, glass, blobs, pseudo-elementos decorativos ni iconos circulares gigantes.

### 6. Agenda clínica: calendario/lista primero

La referencia admin/calendario y los dashboards healthcare priorizan agenda y contexto actual, no un formulario enorme como elemento dominante.

**Decisión ContaGest:** Salud, Veterinaria, Psicología y Odontología deben mostrar agenda/lista + contexto, con formularios compactos de alta/edición. El selector siempre muestra identidad humana, no UUID.

## Contrato por familia de rutas

### Dashboard / Analytics / Reportes

1. Header compacto.
2. 4–6 KPI relevantes máximo por fila lógica.
3. Visualización principal o resumen operativo.
4. Acciones frecuentes próximas al contexto.
5. Detalle/tabla debajo.

### Ventas / Compras / Proveedores / Inventario / Kardex / Bancos

1. Header + primary action.
2. Toolbar de búsqueda/filtros.
3. Tabla densa con owner de scroll.
4. Estados semánticos y montos tabulares.
5. Editor/form dentro de panel claro, no modal gigante sin necesidad.

### Contabilidad / Fiscal / Nómina

1. Estado del período/documento visible.
2. Separar borrador de posteado/cerrado.
3. Debe/Haber y moneda siempre completos.
4. Preview/impresión como capacidad secundaria.
5. No decoración que compita con datos auditables.

### Admin / RBAC / Licencias / Settings / Backend

1. Jerarquía de settings/productividad.
2. Permissions en grids compactos.
3. Acciones destructivas visualmente diferenciadas.
4. Nunca otra paleta/theme administrativa.
5. Datos técnicos se muestran sólo cuando aportan al trabajo.

### Health / Veterinary / Psychology / Dentistry

1. Agenda/lista como superficie primaria.
2. Próximas citas / contexto de paciente.
3. Formulario compacto y accionable.
4. Nombres/contactos humanos, no IDs técnicos.
5. Confirmaciones WhatsApp/email como acciones secundarias.

### Gym / Rutinas / Nutrición

1. Contexto miembro/entrenador primero.
2. Tabs horizontales con overflow propio.
3. Formulario y listado compartiendo escala del ERP.
4. `cg-gym-*` es hook de dominio, no mini design system.

### POS / Pedidos / Delivery

1. Touch targets donde la velocidad operativa lo exige.
2. Carrito/orden visible durante operación.
3. Kanban posee su scroll horizontal.
4. Estados de pedido claros y compactos.

## Responsive

La matriz obligatoria se prueba en:

```text
360
390
430
768
1024
1440
```

Criterios:

- documento sin horizontal overflow;
- acciones visibles;
- header/sidebar no se solapan;
- moneda/documentos no se cortan;
- tablas/calendarios/kanban poseen su propio scroll;
- formularios colapsan a una columna cuando el ancho no permite dos.

## Definition of Done visual

Una vista no está terminada porque "se aplicó CSS". Debe pasar:

```text
Source ownership
→ Desktop
→ Tablet
→ Mobile
→ Light/Dark + contrast/a11y
→ Functional workflow
→ Cleanup
→ Regression
```

Gates:

```bash
npm run audit:visual:strict
npm run audit:functions:strict
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
npm run test:browser:functional
```

Los estados de evidencia son exclusivamente `PASS`, `FAIL`, `BLOCKED` y `NOT_EXECUTED`.
