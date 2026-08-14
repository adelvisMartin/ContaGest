# CONTROL HÍPICO · Precision Hípica

## Personalidad

Control Hípico es un producto operacional propio: sobrio, preciso, rápido y confiable. No debe sentirse como demo, casino, extensión contable ni clon visual de ContaGest. ContaGest-VE se usa únicamente como referencia de madurez de arquitectura, seguridad, responsive, QA y sistema de diseño.

## Identidad

- Nombre visible obligatorio: **CONTROL HÍPICO**.
- Marca primaria: caballo negro con base verde oliva y detalles dorados suministrado para el producto.
- Marca prohibida: `Triple Crown` y cualquier derivado visible o funcional.
- El app mark se usa en favicon, PWA, Apple touch icon, splash y Open Graph sin deformar el caballo.

## Tokens

La UI consume únicamente variables semánticas `--ch-*` desde `frontend/public/hipico-control/assets/css/precision-hipica.css`.

- Superficies: `--ch-bg`, `--ch-surface`, `--ch-surface-2`, `--ch-border`.
- Texto: `--ch-text`, `--ch-muted`.
- Marca: `--ch-primary`, `--ch-primary-hover`, `--ch-on-primary`, `--ch-accent`.
- Estados: `--ch-success`, `--ch-warning`, `--ch-danger`, `--ch-info`, `--ch-focus`.
- Radios: 6 / 10 / 14 px y píldora.
- Espaciado: escala base 4, 8, 12, 16, 20, 24, 32 px.

No se agregan colores hexadecimales aislados dentro de componentes de dominio.

## Tipografía y datos

Inter es la fuente UI. Cuerpo normal 400-500, controles/labels 600, títulos 650-700. No usar 800/900 para jerarquía habitual. Montos y totales usan números tabulares y fuente monoespaciada cuando mejora la lectura.

## Mobile-first

- 44x44 px como objetivo táctil mínimo.
- Una columna para formularios pequeños.
- Barra inferior para Resumen, Captura, Participantes, Historial y Configuración.
- Menú completo mediante drawer.
- Sin scroll horizontal accidental fuera de tablas explícitamente desplazables.
- `safe-area-inset-*` y PWA standalone considerados en shell y navegación.
- El header prioriza marca, estado local/sync, búsqueda/acciones frecuentes y tema/configuración.

## Desktop

A partir de 1024 px se habilita sidebar fija compacta. El contenido continúa usando los mismos componentes/tokens; no existe un segundo diseño paralelo.

## Estados de sincronización

El lenguaje visible distingue `Local listo`, `Offline` y `Pendiente`. Nunca se presenta una escritura local como éxito cloud. Rojo se reserva para pérdida/bloqueo/error, verde para confirmación y ámbar para revisión.

## Motion

Feedback inmediato 120-180 ms y overlays 180-260 ms cuando aporten comprensión. `prefers-reduced-motion` desactiva transiciones no esenciales.

## Componentes

Los componentes de dominio deben construirse encima de un conjunto común: Button, IconButton, Input, NumberInput, Select, Search, FormField, Badge, StatusDot, Card/Panel, MetricCard, Table/DataGrid, EmptyState, Alert, Dialog/Drawer, BottomNav, Sidebar, SyncStatus, OfflineBanner, ConfirmAction y Money/Balance display.

## Regla de migración

No crear hojas `hotfix`, `vXX` o estilos por módulo para resolver geometría. La nueva UI de Control Hípico se desarrolla en `precision-hipica.css`; cualquier CSS histórico solo puede permanecer temporalmente fuera del nuevo shell mientras se caracterizan flujos antiguos.
