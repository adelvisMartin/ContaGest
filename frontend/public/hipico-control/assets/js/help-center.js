import { escapeHtml, icon } from './ui.js';

const STORAGE_KEY = 'hipico.help.contextual.v1';
const TOPICS = Object.freeze([
  {
    id: 'inicio', title: 'Resumen e inicio', keywords: 'inicio dashboard grupos jornada métricas',
    body: `<h3>Resumen e inicio</h3><p>Es la vista de situación del turno. Aquí ves grupos activos, carreras, apuestas, pendientes y comisión consolidada.</p><ol><li>Confirma el <strong>grupo activo</strong> antes de registrar.</li><li>Usa <strong>Nueva carrera</strong> para abrir la jornada operativa.</li><li>Los atajos llevan a captura, adelantadas, historial y cierres sin alterar datos.</li></ol>`
  },
  {
    id: 'captura', title: 'Captura de apuestas', keywords: 'captura rápida apuesta juega consigue monto caballo sin',
    body: `<h3>Captura de apuestas</h3><p>La línea rápida sirve para registrar con el menor número de toques; el formulario guiado permite revisar cada campo.</p><ol><li>Abre la carrera correcta.</li><li>Selecciona uno o varios grupos si la misma jugada debe registrarse en paralelo.</li><li>Indica jugada, caballo, monto, quién juega y quién consigue.</li><li>Revisa el último comprobante antes de continuar.</li></ol><div class="hc-help-callout">Los chips rápidos nunca deben bloquear el desplazamiento vertical de la pantalla.</div>`
  },
  {
    id: 'carrera', title: 'Carrera, riesgo y pizarra', keywords: 'carrera riesgo pizarra liquidar resultado cierre recepción',
    body: `<h3>Carrera, riesgo y pizarra</h3><p>Cada carrera pasa por recepción, revisión de riesgo, pizarra y liquidación.</p><ol><li><strong>Captura:</strong> recibe jugadas mientras la carrera está abierta.</li><li><strong>Riesgo:</strong> muestra exposición y disponible por participante.</li><li><strong>Pizarra:</strong> registra llegada, retirados y empates.</li><li><strong>Procesar resultados:</strong> liquida sólo cuando la pizarra esté confirmada.</li></ol>`
  },
  {
    id: 'whatsapp', title: 'WhatsApp SOURCE y LAB', keywords: 'whatsapp chat source lab bridge shadow parser',
    body: `<h3>WhatsApp SOURCE y LAB</h3><p>El sistema puede analizar chat pegado manualmente y consultar evaluaciones shadow del Bridge.</p><div class="hc-help-callout hc-help-safety"><strong>Regla de seguridad:</strong> SOURCE permanece sólo lectura durante QA. LAB es el único destino de escritura y simulación.</div><ol><li>Pega o carga el bloque del chat.</li><li>Revisa parejas, respuestas citadas y señales operativas.</li><li>Valida manualmente cualquier caso ambiguo.</li><li>Importa únicamente parejas compatibles con la carrera activa.</li></ol>`
  },
  {
    id: 'participantes', title: 'Participantes y disponibles', keywords: 'participantes saldos aval teléfono código disponible',
    body: `<h3>Participantes y disponibles</h3><p>Cada participante pertenece a un grupo y conserva saldo, avales y teléfono de WhatsApp.</p><ol><li>Usa un código corto y único.</li><li>El teléfono ayuda a reconocer al remitente del chat.</li><li>El disponible combina saldo y aval según la configuración del participante.</li></ol>`
  },
  {
    id: 'adelantadas', title: 'Apuestas adelantadas', keywords: 'adelantadas lote futuras importar',
    body: `<h3>Apuestas adelantadas</h3><p>Permiten preparar jugadas de carreras futuras y cargarlas después en la carrera correspondiente.</p><ol><li>Registra una adelantada individual o pega un lote.</li><li>Verifica fecha, hipódromo y número de carrera.</li><li>Usa <strong>Crear/cargar carrera</strong> sólo cuando vaya a operar ese evento.</li></ol>`
  },
  {
    id: 'historial', title: 'Historial y auditoría', keywords: 'historial auditoria filtros movimientos trazabilidad',
    body: `<h3>Historial y auditoría</h3><p>El historial permite filtrar jugadas; la auditoría conserva acciones importantes del workspace.</p><ol><li>Filtra por fechas, hipódromo, participante, jugada o estado.</li><li>Exporta CSV cuando necesites revisión externa.</li><li>No borres historial para corregir: usa los flujos de anulación o ajuste disponibles.</li></ol>`
  },
  {
    id: 'cierres', title: 'Cierres, saldos y reportes', keywords: 'cierre diario semanal saldos pdf excel reportes',
    body: `<h3>Cierres, saldos y reportes</h3><p>El cierre diario valida que no queden apuestas pendientes, carreras abiertas ni diferencias de control.</p><ol><li>Termina y liquida las carreras.</li><li>Comprueba que la diferencia sea cero.</li><li>Genera PDF, Excel o texto de saldos.</li><li>El cierre semanal guarda una fotografía de saldos para comparar el siguiente período.</li></ol>`
  },
  {
    id: 'grupos', title: 'Grupos y operación simultánea', keywords: 'grupos multigrupo simultaneo configuración',
    body: `<h3>Grupos y operación simultánea</h3><p>Los grupos son independientes en participantes, saldos, carreras, moneda y textos, pero una captura puede replicarse de forma controlada.</p><ol><li>Configura cada grupo con nombre operativo, encabezado, moneda y tasa.</li><li>Selecciona los grupos que recibirán la captura simultánea.</li><li>El sistema crea la carrera equivalente y relaciona participantes por código cuando corresponde.</li></ol>`
  },
  {
    id: 'usuarios', title: 'Usuarios, roles y contraseña', keywords: 'usuarios roles admin operator viewer auditor contraseña recovery',
    body: `<h3>Usuarios, roles y contraseña</h3><p>Supabase Auth controla identidad y contraseña. Control Hípico sólo guarda autorización y el estado no secreto de la credencial.</p><ul><li><strong>Admin:</strong> administra acceso y operación.</li><li><strong>Operator:</strong> puede operar el workspace.</li><li><strong>Viewer/Auditor:</strong> sólo lectura.</li></ul><div class="hc-help-callout">La columna “Contraseña” muestra estado y recuperación; nunca muestra ni almacena la contraseña real.</div>`
  },
  {
    id: 'offline', title: 'Sin conexión y sincronización', keywords: 'offline sin conexión nube indexeddb sincronizar',
    body: `<h3>Sin conexión y sincronización</h3><p>IndexedDB mantiene continuidad local. Cuando vuelve la conexión, la cola pendiente puede sincronizarse con el workspace autorizado.</p><ol><li>Si pierdes internet, continúa operando normalmente.</li><li>Observa el indicador de pendientes.</li><li>Al recuperar conexión, espera la sincronización o usa <strong>Sincronizar ahora</strong>.</li></ol>`
  },
  {
    id: 'respaldo', title: 'Respaldo y recuperación', keywords: 'backup respaldo json snapshot restaurar recuperación',
    body: `<h3>Respaldo y recuperación</h3><p>Las copias locales y el respaldo JSON protegen la continuidad del trabajo.</p><ol><li>Crea una copia local antes de cambios importantes.</li><li>Guarda periódicamente un JSON fuera del dispositivo.</li><li>Restaura sólo una copia cuya fecha y origen reconozcas.</li></ol>`
  },
  {
    id: 'instalacion', title: 'Instalación, tema y accesibilidad', keywords: 'instalar pwa android tema claro oscuro accesibilidad',
    body: `<h3>Instalación, tema y accesibilidad</h3><p>La PWA puede instalarse como aplicación. El tema puede seguir al dispositivo o fijarse en claro/oscuro.</p><ul><li>Los controles mantienen foco visible para teclado.</li><li>El sistema respeta reducción de movimiento.</li><li>En móvil, el desplazamiento vertical debe permanecer natural incluso en captura.</li></ul>`
  }
]);

const CONTEXT_MAP = Object.freeze({
  'new-race': 'carrera', 'focus-fast': 'captura', 'copy-plan': 'whatsapp', 'copy-closure': 'whatsapp',
  'new-participant': 'participantes', 'new-movement': 'cierres', 'close-day': 'cierres',
  'sync-now': 'offline', 'export-json': 'respaldo', 'create-snapshot': 'respaldo', 'new-group': 'grupos'
});

let currentTopic = 'inicio';
let lastFocused = null;
let observer = null;

function contextualEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch (_) { return true; }
}
function setContextualEnabled(enabled) {
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (_) {}
  decorateContextualHelp();
}

function topicById(id) { return TOPICS.find((topic) => topic.id === id) || TOPICS[0]; }
function topicButton(topic) { return `<button type="button" data-help-topic="${topic.id}" class="${topic.id === currentTopic ? 'is-active' : ''}">${escapeHtml(topic.title)}</button>`; }

function renderTopic(id) {
  currentTopic = topicById(id).id;
  const content = document.querySelector('[data-help-content]');
  if (content) content.innerHTML = topicById(currentTopic).body;
  document.querySelectorAll('[data-help-topic]').forEach((button) => button.classList.toggle('is-active', button.dataset.helpTopic === currentTopic));
}

function closeHelp() {
  document.querySelector('[data-help-backdrop]')?.remove();
  if (lastFocused?.isConnected) requestAnimationFrame(() => lastFocused.focus());
  lastFocused = null;
}

function openHelp(topicId = '') {
  if (document.querySelector('[data-help-backdrop]')) return;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (topicId) currentTopic = topicById(topicId).id;
  const overlay = document.createElement('div');
  overlay.className = 'hc-help-backdrop';
  overlay.dataset.helpBackdrop = 'true';
  overlay.innerHTML = `<section class="hc-help-panel" role="dialog" aria-modal="true" aria-labelledby="hc-help-title" tabindex="-1">
    <header class="hc-help-head"><div><h2 id="hc-help-title">Manual de uso</h2><p>Ayuda bajo demanda · no interrumpe la operación</p></div><button type="button" class="button icon-button button--ghost" data-help-close aria-label="Cerrar ayuda">${icon('close')}</button></header>
    <div class="hc-help-search"><input class="input" type="search" data-help-search placeholder="Buscar: captura, WhatsApp, saldos, usuarios…" aria-label="Buscar en el manual"><label class="switch-row section-gap-small"><input type="checkbox" data-help-contextual ${contextualEnabled() ? 'checked' : ''}><span><b>Ayuda contextual sutil</b><small>Añade descripciones al pasar por controles clave. Nunca abre ventanas por sí sola.</small></span></label></div>
    <div class="hc-help-body"><nav class="hc-help-nav" aria-label="Temas del manual" data-help-nav>${TOPICS.map(topicButton).join('')}</nav><article class="hc-help-content" data-help-content>${topicById(currentTopic).body}</article></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-help-close]')?.addEventListener('click', closeHelp);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeHelp(); });
  overlay.querySelectorAll('[data-help-topic]').forEach((button) => button.addEventListener('click', () => renderTopic(button.dataset.helpTopic)));
  const search = overlay.querySelector('[data-help-search]');
  search?.addEventListener('input', () => {
    const query = String(search.value || '').trim().toLowerCase();
    const matches = !query ? TOPICS : TOPICS.filter((topic) => `${topic.title} ${topic.keywords}`.toLowerCase().includes(query));
    const nav = overlay.querySelector('[data-help-nav]');
    if (nav) nav.innerHTML = matches.length ? matches.map(topicButton).join('') : '<span class="muted">Sin coincidencias.</span>';
    nav?.querySelectorAll('[data-help-topic]').forEach((button) => button.addEventListener('click', () => renderTopic(button.dataset.helpTopic)));
  });
  overlay.querySelector('[data-help-contextual]')?.addEventListener('change', (event) => setContextualEnabled(event.target.checked));
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeHelp(); } });
  requestAnimationFrame(() => overlay.querySelector('.hc-help-panel')?.focus());
}

function activeViewTopic() {
  const title = document.querySelector('.topbar h1, .mobile-brand strong')?.textContent?.toLowerCase() || '';
  if (title.includes('carrera')) return 'carrera';
  if (title.includes('whatsapp') || title.includes('chat')) return 'whatsapp';
  if (title.includes('adelant')) return 'adelantadas';
  if (title.includes('particip') || title.includes('saldo')) return 'participantes';
  if (title.includes('historial')) return 'historial';
  if (title.includes('cierre')) return 'cierres';
  if (title.includes('config')) return 'grupos';
  return 'inicio';
}

function decorateContextualHelp() {
  document.querySelectorAll('[data-hc-context]').forEach((node) => { node.removeAttribute('data-hc-context'); node.removeAttribute('title'); });
  if (!contextualEnabled()) return;
  document.querySelectorAll('[data-action]').forEach((node) => {
    const topicId = CONTEXT_MAP[node.dataset.action];
    if (!topicId) return;
    const topic = topicById(topicId);
    node.dataset.hcContext = topicId;
    if (!node.getAttribute('title')) node.setAttribute('title', `Ayuda: ${topic.title}`);
  });
}

function mountTrigger() {
  if (document.querySelector('[data-help-trigger]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hc-help-trigger';
  button.dataset.helpTrigger = 'true';
  button.setAttribute('aria-label', 'Abrir manual de uso');
  button.innerHTML = `${icon('help')}<span>Ayuda</span>`;
  button.addEventListener('click', () => openHelp(activeViewTopic()));
  document.body.appendChild(button);
}

function boot() {
  mountTrigger();
  decorateContextualHelp();
  observer = new MutationObserver(() => { mountTrigger(); decorateContextualHelp(); });
  observer.observe(document.querySelector('#app') || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

export { openHelp, closeHelp, TOPICS };
