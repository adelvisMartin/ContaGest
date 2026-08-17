# DEPRECADO · Hípico WhatsApp Group Bridge (`whatsapp-web.js`)

**No usar para QA nuevo ni para producción.**

Este adaptador se conserva temporalmente solo como historial técnico. Durante las pruebas reales en Windows presentó fallos de inicialización de `whatsapp-web.js` / Puppeteer (`Execution context was destroyed`) aun después de validar Node, Chrome, token y Vercel.

El Bridge canónico para el laboratorio es ahora:

```text
tools/hipico-whatsapp-web-bridge/
```

Ese adaptador usa **WhatsApp Web oficial dentro del Chrome/Edge instalado**, controlado con `playwright-core`, y fue el que pasó las pruebas reales de:

- sesión vinculada y persistente;
- dos participantes;
- corte y recuperación de Internet;
- POST `202` a `/api/v1/hipico-bot/bridge/events`;
- persistencia PostgreSQL;
- deduplicación por provider-message ID;
- cero respuestas automáticas y cero efectos monetarios.

No fusionar ni reactivar PRs que vuelvan a este motor salvo que exista una nueva validación técnica explícita.
