import { createBlankWorkspace } from './seed.js';
import { flushWorkspaceWrites, loadLocalWorkspace } from './store.js';
import { compact } from './whatsapp/normalization.js';
import { parseWhatsAppChat } from './whatsapp.js';
import { compareMatchToActiveRace } from './whatsapp/race-context.js';
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
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
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

export function resolveImportTarget(analysis, workspace) {
  const groupId = activeGroupId(workspace);
  const activeRace = readActiveRace(workspace, groupId);
  const imported = new Set(workspace?.chatImports || []);
  const matches = (analysis?.matches || []).filter((match) => !imported.has(match.id));
  if (!activeRace) return { status: 'NO_ACTIVE_RACE', activeRace: null, matches, decisions: [], reason: 'No hay una carrera activa.' };
  if (!matches.length) return { status: 'NO_MATCH', activeRace, matches: [], decisions: [], reason: 'No hay parejas nuevas para importar.' };

  const decisions = matches.map((match) => ({ match, decision: compareMatchToActiveRace(match, activeRace) }));
  const mismatch = decisions.find(({ decision }) => decision.status === 'MISMATCH');
  if (mismatch) {
    return {
      status: 'MISMATCH',
      activeRace,
      matches,
      decisions,
      reason: mismatch.decision.reason
    };
  }
  const ambiguous = decisions.filter(({ decision }) => decision.status !== 'MATCH');
  if (ambiguous.length) {
    return {
      status: 'AMBIGUOUS',
      activeRace,
      matches,
      decisions,
      reason: `${ambiguous.length} pareja(s) no tienen hipódromo y número de carrera verificables. Confirma manualmente que pertenecen exactamente a la carrera activa.`
    };
  }
  return { status: 'MATCH', activeRace, matches, decisions, reason: 'Todas las parejas coinciden con la carrera activa.' };
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

function raceContextDialog({
  title,
  subtitle = 'Validación de carrera antes de continuar',
  message,
  activeRace,
  contextLabel = 'Pizarra detectada',
  contextValue = 'Sin pizarra',
  helpText = '',
  confirmLabel = ''
}) {
  return new Promise((resolve) => {
    document.querySelector('[data-board-context-dialog]')?.remove();

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.boardContextDialog = 'true';

    const raceText = activeRace ? `${activeRace.racetrack} · ${activeRace.number}ª carrera` : 'Sin carrera activa';
    const confirmAction = confirmLabel
      ? `<button type="button" class="button" data-board-context-confirm>${escapeHtml(confirmLabel)}</button>`
      : '';

    backdrop.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="board-context-title" aria-describedby="board-context-description" tabindex="-1">
        <div class="modal__handle" aria-hidden="true"></div>
        <div class="modal__head">
          <div>
            <h3 id="board-context-title">${escapeHtml(title)}</h3>
            <small>${escapeHtml(subtitle)}</small>
          </div>
          <button type="button" class="button icon-button button--ghost" data-board-context-cancel aria-label="Cerrar">×</button>
        </div>
        <div class="modal__body">
          <div class="ui-state" data-tone="warning">
            <strong class="ui-state__title">Revisión obligatoria</strong>
            <span id="board-context-description">${escapeHtml(message)}</span>
          </div>
          <div class="form-grid two">
            <div class="field"><label>Carrera activa</label><div class="input" aria-readonly="true">${escapeHtml(raceText)}</div></div>
            <div class="field"><label>${escapeHtml(contextLabel)}</label><div class="input" aria-readonly="true">${escapeHtml(contextValue)}</div></div>
          </div>
          <p class="help-text">${escapeHtml(helpText)}</p>
          <div class="modal__actions">
            <button type="button" class="button button--ghost" data-board-context-cancel>${confirmLabel ? 'Cancelar' : 'Cerrar'}</button>
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
      if (target.closest('[data-board-context-confirm]')) return finish(true);
      if (target.closest('[data-board-context-cancel]') || target === backdrop) return finish(false);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return finish(false);
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    backdrop.addEventListener('click', onClick);
    dialog.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => (focusable()[0] || dialog).focus());
  });
}

async function guardBoardApplication(button) {
  if (manualBypassTarget === button) {
    manualBypassTarget = null;
    return true;
  }
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
      title: 'Pizarra bloqueada',
      subtitle: 'Validación de carrera antes de aplicar resultado',
      message: `${decision.reason} Abre la carrera correcta y vuelve a aplicar.`,
      activeRace: decision.activeRace,
      contextLabel: 'Pizarra detectada',
      contextValue: decision.board?.board?.join('.') || 'Sin pizarra',
      helpText: 'Control Hípico no liquida dinero por una llegada ambigua. Confirma manualmente solo si verificaste que la pizarra pertenece exactamente a la carrera activa.'
    });
    return false;
  }
  if (decision.status === 'AMBIGUOUS') {
    const approved = await raceContextDialog({
      title: 'Confirmar pizarra manualmente',
      subtitle: 'Validación de carrera antes de aplicar resultado',
      message: decision.reason,
      activeRace: decision.activeRace,
      contextLabel: 'Pizarra detectada',
      contextValue: decision.board?.board?.join('.') || 'Sin pizarra',
      helpText: 'Control Hípico no liquida dinero por una llegada ambigua. Confirma manualmente solo si verificaste que la pizarra pertenece exactamente a la carrera activa.',
      confirmLabel: 'Confirmar carrera y aplicar'
    });
    if (approved) {
      manualBypassTarget = button;
      queueMicrotask(() => button.click());
    }
    return false;
  }
  notify(decision.reason);
  return false;
}

async function guardMatchImport(button) {
  const workspace = await currentWorkspace();
  const analysis = await analyzeVisibleChat(workspace);
  if (!analysis) {
    notify('No se pudo validar la importación porque el bloque de WhatsApp ya no está visible. Vuelve a analizar el chat.');
    return false;
  }
  const decision = resolveImportTarget(analysis, workspace);
  if (decision.status === 'MATCH') return true;
  if (decision.status === 'MISMATCH') {
    notify(`Importación bloqueada: ${decision.reason}`);
    await raceContextDialog({
      title: 'Importación bloqueada',
      subtitle: 'Validación de carrera antes de registrar apuestas',
      message: `${decision.reason} Abre la carrera correcta y vuelve a importar.`,
      activeRace: decision.activeRace,
      contextLabel: 'Parejas detectadas',
      contextValue: `${decision.matches.length} pareja(s)`,
      helpText: 'Control Hípico nunca importa una pareja que declare otra carrera. Cambia a la carrera correcta y repite la operación.'
    });
    return false;
  }
  if (decision.status === 'AMBIGUOUS') {
    const approved = await raceContextDialog({
      title: 'Confirmar importación manualmente',
      subtitle: 'Validación de carrera antes de registrar apuestas',
      message: decision.reason,
      activeRace: decision.activeRace,
      contextLabel: 'Parejas sin contexto completo',
      contextValue: `${decision.decisions.filter(({ decision: item }) => item.status !== 'MATCH').length} pareja(s)`,
      helpText: 'La confirmación no sustituye la validación individual de jugada, caballo, monto y participantes. Las parejas marcadas para revisión siguen requiriendo Validar en la pantalla.',
      confirmLabel: 'Confirmar carrera e importar'
    });
    if (approved) {
      manualBypassTarget = button;
      queueMicrotask(() => button.click());
    }
    return false;
  }
  notify(decision.reason);
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const boardButton = target?.closest('[data-action="apply-chat-board"]') || null;
    const importButton = target?.closest('[data-action="import-chat-matches"]') || null;
    const button = boardButton || importButton;
    if (!button) return;
    if (manualBypassTarget === button) {
      manualBypassTarget = null;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const guard = boardButton ? guardBoardApplication : guardMatchImport;
    guard(button).then((allowed) => {
      if (!allowed) return;
      manualBypassTarget = button;
      button.click();
    }).catch((error) => {
      notify(error?.message || 'No se pudo validar el contexto de la carrera.');
    });
  }, true);
}

export const __test__ = { normalizedTrack, sameTrack, nearestOpeningContext };
