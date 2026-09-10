import { createBlankWorkspace } from './seed.js';
import { flushWorkspaceWrites, loadLocalWorkspace } from './store.js';
import { compact } from './whatsapp/normalization.js';
import { parseWhatsAppChat } from './whatsapp.js';
import { normalizeWorkspaceShape } from './workspace.js';
import { activeGroupId, activeRace as readActiveRace } from './operational-ledger.js';

let manualBypassTarget = null;

function normalizedTrack(value) {
  return compact(String(value || '')).replace(/\b(DOWN)\b/g, 'DOWNS');
}

function sameTrack(left, right) {
  const a = normalizedTrack(left);
  const b = normalizedTrack(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
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
    window.alert(`Pizarra bloqueada.\n\n${decision.reason}\n\nAbre la carrera correcta y vuelve a aplicar.`);
    return false;
  }
  if (decision.status === 'AMBIGUOUS') {
    const active = decision.activeRace;
    const board = decision.board?.board?.join('.') || '';
    const approved = window.confirm(`La llegada ${board} no trae contexto suficiente para verificar la carrera.\n\nCarrera activa: ${active.racetrack} ${active.number}ª.\n\n¿Confirmas manualmente que esta pizarra pertenece a esa carrera?`);
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
    const button = event.target instanceof Element ? event.target.closest('[data-action="apply-chat-board"]') : null;
    if (!button) return;
    if (manualBypassTarget === button) {
      manualBypassTarget = null;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    guardBoardApplication(button).then((allowed) => {
      if (!allowed) return;
      manualBypassTarget = button;
      button.click();
    }).catch((error) => {
      notify(error?.message || 'No se pudo validar el contexto de la pizarra.');
    });
  }, true);
}

export const __test__ = { normalizedTrack, sameTrack, nearestOpeningContext };
