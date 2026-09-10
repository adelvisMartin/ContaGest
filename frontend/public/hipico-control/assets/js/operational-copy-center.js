import { createBlankWorkspace } from './seed.js';
import { generateArrivalWhatsappText, generateBalancesWhatsappText, generateDailySummaryText, generateParticipantStatementText, generateWhatsappText } from './format.js';
import { generateClosureText } from './whatsapp.js';
import { downloadFile, flushWorkspaceWrites, getAppMode, loadLocalWorkspace } from './store.js';
import { normalizeWorkspaceShape } from './workspace.js';
import { activeDay, activeGroupId, activeRace, balanceRows, dailyStats, groupProfile, participantStatement, scopeItems } from './operational-ledger.js';

const ROOT_ID = 'hipico-operational-copy-center';
let state = { workspace: null, participantId: '' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function raceOrdinal(value) {
  const n = Number(value || 1);
  if (n === 1 || n === 3 || n === 13) return `${n}ra`;
  if (n === 2) return `${n}da`;
  if ([10, 11, 12].includes(n)) return `${n}ma`;
  return `${n}ta`;
}

function localDate(value) {
  try {
    return new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  } catch {
    return String(value || '');
  }
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('No se pudo copiar el texto.');
  return Promise.resolve();
}

async function readWorkspace() {
  await flushWorkspaceWrites().catch(() => {});
  return normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
}

function raceOpenText(workspace, race) {
  if (!race) return '';
  const profile = groupProfile(workspace, race.groupId || activeGroupId(workspace));
  return [
    `🔓🏇 ${profile.companyName}`,
    localDate(race.date),
    `${race.racetrack}, ${raceOrdinal(race.number)} Carrera`,
    'RECEPCIÓN ABIERTA',
    'La guía y confirmación válida es el chat.'
  ].join('\n');
}

function raceCloseText(workspace, race) {
  if (!race) return generateClosureText(groupProfile(workspace).companyName, 'AMERICANAS');
  const profile = groupProfile(workspace, race.groupId || activeGroupId(workspace));
  return [
    `🔒🏇 ${profile.companyName}`,
    `${race.racetrack}, ${raceOrdinal(race.number)} Carrera`,
    'CARRERA CERRADA · NO MÁS JUGADAS',
    'Los mensajes posteriores quedan para revisión de la próxima carrera.',
    'La guía y confirmación válida es el chat.'
  ].join('\n');
}

function buildTexts(workspace) {
  const groupId = activeGroupId(workspace);
  const group = groupProfile(workspace, groupId);
  const day = activeDay(workspace, groupId);
  const race = activeRace(workspace, groupId);
  const rows = balanceRows(workspace, groupId, day?.date);
  const participants = rows.map((row) => row.participant);
  if (!participants.some((participant) => participant.id === state.participantId)) state.participantId = participants[0]?.id || '';
  const selected = participants.find((participant) => participant.id === state.participantId) || null;
  const statement = selected && day ? participantStatement(workspace, selected.id, day.date) : null;
  let arrival = '';
  if (race && (race.board || []).some(Boolean)) {
    try { arrival = generateArrivalWhatsappText(workspace, race); } catch { arrival = ''; }
  }
  return {
    group,
    day,
    race,
    participants,
    selected,
    messages: {
      opening: raceOpenText(workspace, race),
      plan: race ? generateWhatsappText(workspace, race) : '',
      arrival,
      closing: raceCloseText(workspace, race),
      balances: generateBalancesWhatsappText(workspace, rows),
      daily: day ? generateDailySummaryText(workspace, day, dailyStats(workspace, day, groupId)) : '',
      participant: statement ? generateParticipantStatementText(workspace, statement) : ''
    }
  };
}

function messageCard(id, title, hint, text, open = false) {
  const disabled = !String(text || '').trim();
  return `<details class="ops-message" ${open ? 'open' : ''}>
    <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></span><span aria-hidden="true">⌄</span></summary>
    <div class="ops-message__body">
      <textarea readonly spellcheck="false" data-ops-text="${escapeHtml(id)}" aria-label="${escapeHtml(title)}">${escapeHtml(text || 'Todavía no hay datos suficientes para generar este mensaje.')}</textarea>
      <button type="button" class="ops-button ops-button--primary" data-ops-copy="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}>Copiar texto</button>
    </div>
  </details>`;
}

function renderDialog(root) {
  const workspace = state.workspace;
  if (!workspace) return;
  const model = buildTexts(workspace);
  const { group, day, race, participants, selected, messages } = model;
  root.querySelector('[data-ops-dialog]')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'ops-dialog';
  dialog.dataset.opsDialog = 'true';
  dialog.innerHTML = `<div class="ops-dialog__shell">
    <header class="ops-dialog__head">
      <div><span class="ops-kicker">Centro operativo</span><h2>Textos de WhatsApp</h2><p>${escapeHtml(group.companyName)} · ${race ? `${escapeHtml(race.racetrack)} ${raceOrdinal(race.number)}` : 'sin carrera activa'}</p></div>
      <button type="button" class="ops-icon" data-ops-close aria-label="Cerrar centro operativo">×</button>
    </header>
    <div class="ops-dialog__toolbar">
      <div><strong>${day ? escapeHtml(localDate(day.date)) : 'Sin jornada'}</strong><small>Copiar es manual. Este panel nunca envía mensajes por sí solo.</small></div>
      <button type="button" class="ops-button" data-ops-refresh>Actualizar datos</button>
    </div>
    <div class="ops-dialog__body">
      <section class="ops-grid">
        ${messageCard('opening', 'Apertura de carrera', 'Hipódromo y número actuales', messages.opening)}
        ${messageCard('plan', 'Plano / aportes', 'Juega, Consigue y totales de la carrera', messages.plan, true)}
        ${messageCard('arrival', 'Llegada / pizarra', 'Disponible cuando existe pizarra revisada', messages.arrival)}
        ${messageCard('closing', 'Cierre de carrera', 'Mensaje compacto de no más jugadas', messages.closing)}
        ${messageCard('balances', 'Pozo · TERCIO / DISPONIBLE', 'Saldo operativo + aval según la tasa vigente', messages.balances, true)}
        ${messageCard('daily', 'Cierre diario', 'Resumen de jornada desde datos persistidos', messages.daily)}
      </section>
      <section class="ops-participant">
        <div class="ops-participant__head"><div><span class="ops-kicker">Privado manual</span><h3>Estado de participante</h3><p>Se genera desde el histórico persistido. No se envía automáticamente.</p></div>
          <button type="button" class="ops-button" data-ops-export ${participants.length ? '' : 'disabled'}>Archivo del día (.txt)</button>
        </div>
        <label><span>Participante</span><select data-ops-participant ${participants.length ? '' : 'disabled'}>${participants.map((participant) => `<option value="${escapeHtml(participant.id)}" ${participant.id === selected?.id ? 'selected' : ''}>${escapeHtml(String(participant.code || '').toUpperCase())} · ${escapeHtml(participant.name || participant.code || '')}</option>`).join('')}</select></label>
        ${messageCard('participant', selected ? `Estado de ${String(selected.code || selected.name).toUpperCase()}` : 'Estado individual', 'Listo para copiar al chat privado', messages.participant, true)}
      </section>
    </div>
  </div>`;
  root.append(dialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dialog.close(); });
  dialog.showModal?.();
  if (!dialog.open) dialog.setAttribute('open', '');
  dialog.querySelector('[data-ops-close]')?.focus();
}

async function openCenter() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  state.workspace = await readWorkspace();
  renderDialog(root);
}

async function refreshCenter() {
  state.workspace = await readWorkspace();
  const root = document.getElementById(ROOT_ID);
  if (root) renderDialog(root);
}

function sanitizeFilename(value) {
  return String(value || 'control-hipico').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function exportDailyStatements() {
  const workspace = state.workspace || await readWorkspace();
  const groupId = activeGroupId(workspace);
  const day = activeDay(workspace, groupId);
  if (!day) throw new Error('No hay una jornada para exportar.');
  const participants = scopeItems(workspace, workspace.participants, groupId).filter((participant) => participant.active !== false);
  const profile = groupProfile(workspace, groupId);
  const blocks = participants.map((participant) => generateParticipantStatementText(workspace, participantStatement(workspace, participant.id, day.date)));
  const content = [`${profile.companyName} · ESTADOS PRIVADOS`, localDate(day.date), '', ...blocks.flatMap((block, index) => [index ? '\n============================================================\n' : '', block])].join('\n');
  downloadFile(`${sanitizeFilename(profile.companyName)}-estados-${day.date}.txt`, content, 'text/plain;charset=utf-8');
}

function mount() {
  if (document.getElementById(ROOT_ID)) return;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'ops-root';
  root.innerHTML = `<button type="button" class="ops-launcher" data-ops-open aria-label="Abrir textos operativos de WhatsApp"><span aria-hidden="true">✦</span><span>Mensajes</span></button>`;
  document.body.append(root);
  root.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const copy = target.closest('[data-ops-copy]');
    try {
      if (target.closest('[data-ops-open]')) return void await openCenter();
      if (target.closest('[data-ops-close]')) return void target.closest('dialog')?.close();
      if (target.closest('[data-ops-refresh]')) return void await refreshCenter();
      if (target.closest('[data-ops-export]')) return void await exportDailyStatements();
      if (copy) {
        const id = copy.getAttribute('data-ops-copy');
        const text = target.closest('dialog')?.querySelector(`[data-ops-text="${CSS.escape(id || '')}"]`)?.value || '';
        if (text) await copyText(text);
        copy.textContent = 'Copiado ✓';
        setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copiar texto'; }, 1200);
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('hipico:notice', { detail: { message: error?.message || 'No se pudo completar la acción.' } }));
    }
  });
  root.addEventListener('change', async (event) => {
    const select = event.target instanceof Element ? event.target.closest('[data-ops-participant]') : null;
    if (!select) return;
    state.participantId = select.value;
    renderDialog(root);
  });
}

async function mountWhenAuthorized() {
  try { if (await getAppMode()) mount(); } catch { /* El centro no bloquea el arranque principal. */ }
}

if (typeof document !== 'undefined') {
  window.addEventListener('load', mountWhenAuthorized, { once: true });
  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (form?.id === 'auth-form') setTimeout(mountWhenAuthorized, 900);
  }, true);
}

export const __test__ = { raceOrdinal, raceOpenText, raceCloseText, sanitizeFilename, buildTexts };
