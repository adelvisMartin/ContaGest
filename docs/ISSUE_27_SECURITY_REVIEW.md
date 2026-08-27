# Revisión AppSec / IAM — #27

Invariantes que deben permanecer verdaderos:

1. `system=true` por sí solo nunca cambia una decisión de autorización.
2. Un permiso `platform.*` sólo es efectivo mediante un rol `scope=platform` del tenant interno.
3. Un tenant admin conserva todos sus permisos tenant, pero continúa sujeto a licencia, suscripción y aceptación legal.
4. Ninguna ruta tenant puede conceder `platform.*` mediante payload del cliente.
5. PostgreSQL rechaza bindings globales a roles de tenants cliente aunque la capa API sea eludida.
6. La normalización histórica sólo revoca o clasifica; no concede autoridad nueva.
7. Los tests negativos deben ser más importantes que la mera existencia de un permiso positivo.
