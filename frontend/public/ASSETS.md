# ContaGest · contrato de assets

`frontend/public` mantiene únicamente assets que deben servirse como archivos públicos estables. No colocar aquí lógica de aplicación ni duplicados de imágenes usadas por un solo módulo.

## Estructura

```text
public/
├─ brand/
│  └─ contagest-logo.svg      # marca global del ERP
├─ icons/                     # PWA, favicon y app icons
├─ vertical-assets/           # ilustraciones semánticas del catálogo 70/75
├─ vendor/                    # dependencias visuales críticas self-hosted + licencias
├─ hipico-control/            # producto Control Hípico, aislado del ERP
├─ manifest.webmanifest
├─ pwa-install.js
└─ sw.js
```

## Reglas

- La marca global se referencia desde `brand/`; no copiar el logo dentro de páginas, verticales o componentes.
- `icons/` contiene únicamente variantes técnicas de iconos PWA/app. Evitar copias con nombres de versión.
- `hipico-control/` pertenece al producto Control Hípico y no se usa como librería visual de ContaGest.
- Iconos funcionales de botones, navegación, KPIs y estados usan el helper `icon()` del UI kit y Font Awesome Free self-hosted bajo `vendor/fontawesome/`.
- Inter y JetBrains Mono se sirven localmente desde `vendor/fonts/`; sus licencias OFL se conservan junto a los binarios.
- Las ilustraciones de vertical se resuelven únicamente mediante `frontend/src/assets/verticalAssets.js`; no hardcodear rutas alternativas por vista.
- Una ilustración específica de un vertical debe vivir bajo una carpeta propia solo si existe una necesidad funcional/documentada; no usar imágenes para tapar problemas de jerarquía/layout.
- SVG nuevos deben tener `viewBox`, tamaño intrínseco razonable y no incluir scripts ni recursos remotos.
- No usar assets remotos como dependencia crítica del shell.
- Light/dark se resuelve mediante tokens CSS; no mantener dos copias de un mismo asset solo para cambiar color si el SVG puede heredar `currentColor`.

La guía visual completa está en `docs/design-system/CONTAGEST_VISUAL_SYSTEM_V12.md`.
