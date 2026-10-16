# #794 — Vista Gym fail-closed ante snapshot no verificado

La página GymManagementPage iniciaba `members`, `assessments`, `routines` y `nutrition` con `state.gymVertical` antes de verificar el contexto actual. Su primer fetch era silencioso y una falla offline dejaba visibles datos antiguos, potencialmente de una sesión/tenant previo. Ahora los datos almacenados permanecen ocultos hasta que el servidor devuelve correctamente el catálogo actual y las lecturas del miembro seleccionado. Cada refresh y cambio de miembro revoca la condición de datos verificados; el error presenta un estado de indisponibilidad y botón de reintento, **no** una vista aparentemente actual.

Esta protección no constituye todavía una superficie miembro autoservicio ni un sistema de lectura offline: la UI existente sigue siendo de gestión `gym.manage`. No se habilitan colas de escrituras offline; #797 es su única autoridad. No se guardan tokens, se alteran permisos, ni se modifica DB.

Evidencia: 6/6 pruebas focales sobre JSX real de GitHub verificando el orden de la comprobación, bloqueo de visualización, revocación al refrescar o elegir miembro, y ruta de error. Son contratos estáticos del archivo, no tests de React/Chromium, Android, service worker o tenant A/B. No cerrar #794 hasta completar backend self-read, vistas PWA y pruebas físicas. Sin cambios en Actions ni bypass de controles.
