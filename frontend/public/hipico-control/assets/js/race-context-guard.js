import { createBlankWorkspace } from './seed.js';
import { flushWorkspaceWrites, loadLocalWorkspace } from './store.js';
import { compact } from './whatsapp/normalization.js';
import { parseWhatsAppChat } from './whatsapp.js';
import { normalizeWorkspaceShape } from './workspace.js';
import { activeGroupId, activeRace as readActiveRace } from './operational-ledger.js';

let manualBypassTarget = null;

const TRACK_ALIASES = new Map([
  ['CHURCHILL DOWN', 'CHURCHILL DOWNS'],
  ['COLONIAL DOWN', 'COLONIAL DOWNS'],
  ['GULFSTREAM', 'GULFSTREAM PARK'],
  ['PARX', 'PARX RACING'],
  ['CHARLESTOWN', 'CHARLES TOWN'],
  ['INDIANAPOLIS', 'HORSESHOE INDIANAPOLIS']
]);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function normalizedTrack(value) {
  const raw = compact(String(value || ''));
  return TRACK_ALIASES.get(raw) || raw;
}

function sameTrack(left, right) {
  const a = normalizedTrack(left);
  const b = normalizedTrack(right);
  return Boolean(a && b && a === b);
}

function validRaceNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function messageIndex(analysis, messageId) {
  return (analysis?.messages || []).findIndex((message) => message.id === messageId);
}

function nearestOpeningContext(analysis, board) {
  const boardIndex = messageIndex(analysis, board?.id);
  if (boardIndex < 0) return null;
  const candidates = (analysis?.raceOpenings || [])
    .filter((opening) => opening.segmentId === board.segmentId && opening.raceContext?.actionable)
    .filter((opening) => messageIndex(analysis, opening.id) <= boardIndex)
    .sort((left, right) => messageIndex(analysis, right.id) - messageIndex(analysis, left.id));
  return candidates[0]?.raceContext || null;
}

export function resolveBoardTarget(analysis, workspace) {
  const groupId = activeGroupId(workspace);
  const activeRace = readActiveRace(workspace, groupId);
  const board = analysis?.boards?.at(-1) || null;
  if (!activeRace) return { status: 'NO_ACTIVE_RACE', board, activeRace: null, context: null, reason: 'No hay una carrera activa.' };
  if (!board?.board?.length) return { status: 'NO_BOARD', board: null, activeRace, context: null, reason: 'No hay una llegada o pizarra detectada.' };

  const direct = board.raceContext?.actionable ? board.raceContext : null;
  const inherited = direct || nearestOpeningContext(analysis, board);
  if (!inherited?.actionable) {
    return {
      status: 'AMBIGUOUS',
      board,
      activeRace,
      context: null,
      reason: 'La llegada no declara hipódromo y carrera, ni existe una apertura inequívoca previa en el mismo bloque.'
    };
  }

  const numberMatches = Number(inherited.raceNumber) === Number(activeRace.number);
  const trackMatches = sameTrack(inherited.track, activeRace.racetrack);
  if (!numberMatches || !trackMatches) {
    return {
      status: 'MISMATCH',
      board,
      activeRace,
      context: inherited,
      reason: `La llegada corresponde a ${inherited.track} ${inherited.raceNumber} y la carrera activa es ${activeRace.racetrack} ${activeRace.number}.`
    };
  }

  return { status: 'MATCH', board, activeRace, context: inherited, reason: 'Hipódromo y carrera coinciden con la carrera activa.' };
}

export function resolveMatchTarget(analysis, workspace) {
  const groupId = activeGroupId(workspace);
  const activeRace = readActiveRace(workspace, groupId);
  const matches = Array.isArray(analysis?.matches) ? analysis.matches : [];
  if (!activeRace) return { status: 'NO_ACTIVE_RACE', matches, activeRace: null, reason: 'No hay una carrera activa.' };
  if (!matches.length) return { status: 'NO_MATCHES', matches, activeRace, reason: 'No hay parejas detectadas para importar.' };

  const mismatch = matches.find((match) => {
    const raceNumber = validRaceNumber(match.raceNumber);
    const trackMismatch = Boolean(match.track) && !sameTrack(match.track, activeRace.racetrack);
    const numberMismatch = Boolean(raceNumber) && raceNumber !== Number(activeRace.number);
    return trackMismatch || numberMismatch;
  });
  if (mismatch) {
    const raceLabel = mismatch.raceNumber ? ` ${mismatch.raceNumber}` : '';
    const trackLabel = mismatch.track || 'hipódromo sin identificar';
    return {
      status: 'MISMATCH',
      matches,
      activeRace,
      mismatch,
      reason: `Una pareja pertenece a ${trackLabel}${raceLabel} y la carrera activa es ${activeRace.racetrack} ${activeRace.number}.`
    };
  }

  const incomplete = matches.filter((match) => !match.track || !validRaceNumber(match.raceNumber));
  if (incomplete.length) {
    return {
      status: 'AMBIGUOUS',
      matches,
      activeRace,
      incomplete,
      reason: `${incomplete.length} pareja(s) no tienen hipódromo y número de carrera confirmados por el chat.`
    };
  }

  return {
    status: 'MATCH',
    matches,
    activeRace,
    reason: 'Todas las parejas tienen hipódromo y carrera coincidentes con la carrera activa.'
  };
}

export function resolveImportTarget(analysis, workspace) {
  const imported = new Set(Array.isArray(workspace?.chatImports) ? workspace.chatImports : []);
  const matches = (Array.isArray(analysis?.matches) ? analysis.matches : []).filter((match) => !imported.has(match.id));
  const decision = resolveMatchTarget({ ...analysis, matches }, workspace);
  return { ...decision, importedCount: imported.size };
}

async function currentWorkspace() {
  await flushWorkspaceWrites().catch(() => {});
  return normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
}

function notify(message) {
  window.dispatchEvent(new CustomEvent('hipico:notice', { detail: { message } }));
}

async function analyzeVisibleChat(workspace) {
  const textarea = document.querySelector('#whatsapp-parse-form [name="chat"]');
  const text = String(textarea?.value || '').trim();
  if (!text) return null;
  return parseWhatsAppChat(text, { racetrackCatalog: workspace?.config?.racetrackCatalog || [] });
}

function raceContextDialog({ title, message, activeRace, evidenceLabel, evidenceText, helpText, confirmLabel = '' }) {
  return new Promise((resolve) => {
    document.querySelector('[data-race-context-dialog]')?.remove();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.raceContextDialog = 'true';
    const raceText = activeRace ? `${activeRace.racetrack} · ${activeRace.number}ª carrera` : 'Sin carrera activa';
    const confirmAction = confirmLabel
      ? `<button type="button" class="button" data-race-context-confirm>${escapeHtml(confirmLabel)}</button>`
      : '';

    backdrop.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="race-context-title" aria-describedby="race-context-description" tabindex="-1">
        <div class="modal__handle" aria-hidden="true"></div>
        <div class="modal__head">
          <div><h3 id="race-context-title">${escapeHtml(title)}</h3><small>Validación de carrera antes de modificar el registro operativo</small></div>
          <button type="button" class="button icon-button button--ghost" data-race-context-cancel aria-label="Cerrar">×</button>
        </div>
        <div class="modal__body">
          <div class="ui-state" data-tone="warning"><strong class="ui-state__title">Revisión obligatoria</strong><span id="race-context-description">${escapeHtml(message)}</span></div>
          <div class="form-grid two">
            <div class="field"><label>Carrera activa</label><div class="input" aria-readonly="true">${escapeHtml(raceText)}</div></div>
            <div class="field"><label>${escapeHtml(evidenceLabel)}</label><div class="input" aria-readonly="true">${escapeHtml(evidenceText)}</div></div>
          </div>
          <p class="help-text">${escapeHtml(helpText)}</p>
          <div class="modal__actions">
            <button type="button" class="button button--ghost" data-race-context-cancel>${confirmLabel ? 'Cancelar' : 'Cerrar'}</button>
            ${confirmAction}
          </div>
        </div>
      </section>`;

    document.body.appendChild(backdrop);
    const dialog = backdrop.querySelector('[role="dialog"]');
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    let settled = false;
    const finish = (approved) => {
      if (settled) return;
      settled = true;
      backdrop.removeEventListener('click', onClick);
      dialog.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus());
      resolve(Boolean(approved));
    };
    const onClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('[data-race-context-confirm]')) return finish(true);
      if (target.closest('[data-race-context-cancel]') || target === backdrop) return finish(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); return finish(false); }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    backdrop.addEventListener('click', onClick);
    dialog.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => (focusable()[0] || dialog).focus());
  });
}

async function guardBoardApplication(button) {
  const workspace = await currentWorkspace();
  const analysis = await analyzeVisibleChat(workspace);
  if (!analysis) {
    notify('No se pudo validar la pizarra porque el bloque de WhatsApp ya no está visible. Vuelve a analizar el chat.');
    return false;
  }
  const decision = resolveBoardTarget(analysis, workspace);
  if (decision.status === 'MATCH') return true;
  if (decision.status === 'MISMATCH') {
    notify(`Pizarra bloqueada: ${decision.reason}`);
    await raceContextDialog({
      title: 'Pizarra bloqueada', message: `${decision.reason} Abre la carrera correcta y vuelve a aplicar.`, activeRace: decision.activeRace,
      evidenceLabel: 'Pizarra detectada', evidenceText: decision.board?.board?.join('.') || 'Sin pizarra',
      helpText: 'Control Hípico no liquida dinero por una llegada ambigua o atribuida a otra carrera.'
    });
    return false;
  }
  if (decision.status === 'AMBIGUOUS') {
    const approved = await raceContextDialog({
      title: 'Confirmar pizarra manualmente', message: decision.reason, activeRace: decision.activeRace,
      evidenceLabel: 'Pizarra detectada', evidenceText: decision.board?.board?.join('.') || 'Sin pizarra',
      helpText: 'Control Hípico no liquida dinero por una llegada ambigua. Confirma manualmente solo si verificaste que la pizarra pertenece exactamente a la carrera activa.',
      confirmLabel: 'Confirmar carrera y aplicar'
    });
    if (approved) { manualBypassTarget = button; queueMicrotask(() => button.click()); }
    return false;
  }
  notify(decision.reason);
  return false;
}

async function guardMatchImport(button) {
  const workspace = await currentWorkspace();
  const analysis = await analyzeVisibleChat(workspace);
  if (!analysis) {
    notify('No se pudo validar la carrera de las parejas porque el bloque de WhatsApp ya no está visible. Vuelve a analizar el chat.');
    return false;
  }
  const decision = resolveImportTarget(analysis, workspace);
  if (decision.status === 'MATCH') return true;
  if (decision.status === 'MISMATCH') {
    notify(`Importación bloqueada: ${decision.reason}`);
    await raceContextDialog({
      title: 'Importación bloqueada', message: `${decision.reason} Abre la carrera correcta y vuelve a importar.`, activeRace: decision.activeRace,
      evidenceLabel: 'Parejas detectadas', evidenceText: `${decision.matches.length} pareja(s)`,
      helpText: 'Una pareja con contexto conocido de otra carrera nunca se importa mediante una confirmación manual.'
    });
    return false;
  }
  if (decision.status === 'AMBIGUOUS') {
    const approved = await raceContextDialog({
      title: 'Confirmar carrera de las parejas', message: decision.reason, activeRace: decision.activeRace,
      evidenceLabel: 'Parejas detectadas', evidenceText: `${decision.matches.length} pareja(s) · ${decision.incomplete.length} sin contexto completo`,
      helpText: 'Confirma sólo si verificaste en el chat que las parejas pertenecen exactamente a la carrera activa. Esto no liquida saldos.',
      confirmLabel: 'Confirmar carrera e importar'
    });
    if (approved) { manualBypassTarget = button; queueMicrotask(() => button.click()); }
    return false;
  }
  notify(decision.status === 'NO_MATCHES' && decision.importedCount ? 'No hay parejas nuevas: las parejas detectadas ya fueron importadas.' : decision.reason);
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-action="apply-chat-board"], [data-action="import-chat-matches"]')
      : null;
    if (!button) return;
    if (manualBypassTarget === button) { manualBypassTarget = null; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = button.getAttribute('data-action');
    const guard = action === 'import-chat-matches' ? guardMatchImport : guardBoardApplication;
    guard(button).then((allowed) => {
      if (!allowed) return;
      manualBypassTarget = button;
      button.click();
    }).catch((error) => notify(error?.message || 'No se pudo validar el contexto de la carrera.'));
  }, true);
}

export const __test__ = { normalizedTrack, sameTrack, validRaceNumber, nearestOpeningContext };
