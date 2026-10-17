import { createBlankWorkspace } from './seed.js';
import { generateArrivalWhatsappText, generateBalancesWhatsappText, generateDailySummaryText, generateParticipantStatementText, generateWhatsappText } from './format.js';
import { generateClosureText } from './whatsapp.js';
import { downloadFile, flushWorkspaceWrites, loadLocalWorkspace } from './store.js';
import { normalizeWorkspaceShape } from './workspace.js';
import { activeDay, activeGroupId, activeRace, balanceRows, dailyStats, groupProfile, participantStatement, scopeItems } from './operational-ledger.js';
import { escapeHtml, icon } from './ui.js';

const ROOT_ID = 'hipico-operational-copy-center';
// An async clipboard completion only belongs to the exact reviewed draft
// revision that started it, not merely to an equal string typed later.
const manualDraftRevisions = new WeakMap();
const pendingManualClipboardWrites = new WeakSet();

function invalidateManualDraftReview(dialog) {
  if (!dialog) return;
  manualDraftRevisions.set(dialog, (manualDraftRevisions.get(dialog) ?? 0) + 1);
}

let state = { workspace: null, participantId: '' };

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

function copyButtonContent(copied = false) {
  return `${icon(copied ? 'check' : 'copy')}<span>${copied ? 'Copiado' : 'Copiar texto'}</span>`;
}

// An intentionally blank human-only draft. No incoming chat, financial ledger,
// LLM text, or persistent participant data is used to prefill this surface.
export function mayCopyManualSuggestion(text, confirmation) {
  return typeof text === 'string' && text.trim().length > 0 &&
    text.length <= 1200 && confirmation === true;
}

function manualSuggestionCard() {
  const date = new Intl.DateTimeFormat('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(new Date());
  return `<section class="ops-participant" data-ops-manual>
    <div class="ops-participant__head"><div><span class="ops-kicker">Asistencia manual · Messenger</span>
      <h3>Respuesta escrita por ti</h3>
      <p>Fuente: texto introducido por una persona · Fecha: ${escapeHtml(date)}</p>
      <p>Solo para el grupo recreativo, sin dinero real. Nunca lee WhatsApp ni envía mensajes.</p>
    </div></div>
    <label><span>Escribe o edita tu sugerencia (máximo 1200 caracteres)</span>
      <textarea data-ops-manual-text maxlength="1200" rows="5" spellcheck="true" autocomplete="off"
        aria-label="Respuesta manual editable" placeholder="Escribe aquí un mensaje informativo..."></textarea>
    </label>
    <label><input type="checkbox" data-ops-manual-consent>
      Declaro que el grupo ha autorizado compartir este contenido y que no incluyo datos privados de terceros sin permiso.</label>
    <label><input type="checkbox" data-ops-manual-confirm>
      He revisado el contenido y decidiré personalmente dónde compartirlo.</label>
    <div class="ops-message__body">
      <button type="button" class="ops-button ops-button--primary" data-ops-manual-copy disabled>
        ${copyButtonContent(false)}</button>
      <button type="button" class="ops-button" data-ops-manual-clear>Cancelar y borrar</button>
    </div>
    <small>Ambas confirmaciones son necesarias. Si no cuentas con consentimiento, no compartas. Copiar no abre WhatsApp ni produce entregas automáticas. El borrador se borra al cerrar el panel.</small>
  </section>`;
}

function updateManualSuggestionControls(dialog) {
  const draft = dialog?.querySelector('[data-ops-manual-text]');
  const confirmation = dialog?.querySelector('[data-ops-manual-confirm]');
  const consent = dialog?.querySelector('[data-ops-manual-consent]');
  const copy = dialog?.querySelector('[data-ops-manual-copy]');
  if (copy) copy.disabled = pendingManualClipboardWrites.has(copy) || consent?.checked !== true || !mayCopyManualSuggestion(draft?.value, confirmation?.checked);
}

function messageCard(id, title, hint, text, open = false) {
  const disabled = !String(text || '').trim();
  return `<details class="ops-message" ${open ? 'open' : ''}>
    <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(hint)}</small></span><span class="ops-chevron" aria-hidden="true">${icon('back')}</span></summary>
    <div class="ops-message__body">
      <textarea readonly spellcheck="false" data-ops-text="${escapeHtml(id)}" aria-label="${escapeHtml(title)}">${escapeHtml(text || 'Todavía no hay datos suficientes para generar este mensaje.')}</textarea>
      <button type="button" class="ops-button ops-button--primary" data-ops-copy="${escapeHtml(id)}" ${disabled ? 'disabled' : ''}>${copyButtonContent(false)}</button>
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
  dialog.setAttribute('aria-labelledby', 'ops-dialog-title');
  dialog.setAttribute('aria-describedby', 'ops-dialog-description');
  dialog.innerHTML = `<div class="ops-dialog__shell">
    <header class="ops-dialog__head">
      <div><span class="ops-kicker">Centro operativo</span><h2 id="ops-dialog-title">Textos de WhatsApp</h2><p id="ops-dialog-description">${escapeHtml(group.companyName)} · ${race ? `${escapeHtml(race.racetrack)} ${raceOrdinal(race.number)}` : 'sin carrera activa'}</p></div>
      <button type="button" class="ops-icon" data-ops-close aria-label="Cerrar centro operativo" title="Cerrar">${icon('close')}</button>
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
      ${manualSuggestionCard()}
      <section class="ops-participant">
        <div class="ops-participant__head"><div><span class="ops-kicker">Privado manual</span><h3>Estado de participante</h3><p>Se genera desde el histórico persistido. No se envía automáticamente.</p></div>
          <button type="button" class="ops-button" data-ops-export ${participants.length ? '' : 'disabled'}>${icon('report')}<span>Archivo del día (.txt)</span></button>
        </div>
        <label><span>Participante</span><select data-ops-participant ${participants.length ? '' : 'disabled'}>${participants.map((participant) => `<option value="${escapeHtml(participant.id)}" ${participant.id === selected?.id ? 'selected' : ''}>${escapeHtml(String(participant.code || '').toUpperCase())} · ${escapeHtml(participant.name || participant.code || '')}</option>`).join('')}</select></label>
        ${messageCard('participant', selected ? `Estado de ${String(selected.code || selected.name).toUpperCase()}` : 'Estado individual', 'Listo para copiar al chat privado', messages.participant, true)}
      </section>
    </div>
  </div>`;
  root.append(dialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('close', () => {
    // Any pending clipboard resolution is stale once the operator closes.
    invalidateManualDraftReview(dialog);
    // Do not retain private drafts in hidden DOM after dismissing the panel.
    const draft = dialog.querySelector('[data-ops-manual-text]');
    const confirmation = dialog.querySelector('[data-ops-manual-confirm]');
    if (draft) draft.value = '';
    if (confirmation) confirmation.checked = false;
    const consent = dialog.querySelector('[data-ops-manual-consent]');
    if (consent) consent.checked = false;
    const copy = dialog.querySelector('[data-ops-manual-copy]');
    if (copy) copy.innerHTML = copyButtonContent(false);
    updateManualSuggestionControls(dialog);
  });
  dialog.showModal?.();
  if (!dialog.open) dialog.setAttribute('open', '');
  dialog.querySelector('[data-ops-close]')?.focus();
}

async function openCenter() {
  const root = document.getElementById(ROOT_ID);
  if (!root || root.dataset.opsAuthorized !== 'true') return;
  state.workspace = await readWorkspace();
  renderDialog(root);
}

async function refreshCenter() {
  const root = document.getElementById(ROOT_ID);
  if (!root || root.dataset.opsAuthorized !== 'true') return;
  state.workspace = await readWorkspace();
  renderDialog(root);
}

function sanitizeFilename(value) {
  return String(value || 'control-hipico').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function exportDailyStatements() {
  const root = document.getElementById(ROOT_ID);
  if (!root || root.dataset.opsAuthorized !== 'true') throw new Error('Centro operativo no autorizado.');
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

export function resetOperationalCopyCenter() {
  state = { workspace: null, participantId: '' };
  if (typeof document === 'undefined') return;
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.dataset.opsAuthorized = 'false';
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
  root.querySelectorAll('[data-ops-dialog]').forEach((node) => node.remove());
  root.remove();
}

export function mountOperationalCopyCenter() {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'ops-root';
  root.dataset.opsAuthorized = 'false';
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<button type="button" class="ops-launcher" data-ops-open aria-label="Abrir textos operativos de WhatsApp" title="Textos de WhatsApp">${icon('chat')}<span>Mensajes</span></button>`;
  document.body.append(root);
  root.addEventListener('click', async (event) => {
    if (root.dataset.opsAuthorized !== 'true') return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const copy = target.closest('[data-ops-copy]');
    try {
      if (target.closest('[data-ops-open]')) return void await openCenter();
      if (target.closest('[data-ops-close]')) return void target.closest('dialog')?.close();
      if (target.closest('[data-ops-refresh]')) return void await refreshCenter();
      if (target.closest('[data-ops-export]')) return void await exportDailyStatements();
      if (target.closest('[data-ops-manual-clear]')) {
        const dialog = target.closest('dialog');
        const draft = dialog?.querySelector('[data-ops-manual-text]');
        const confirmation = dialog?.querySelector('[data-ops-manual-confirm]');
        invalidateManualDraftReview(dialog);
        if (draft) draft.value = '';
        if (confirmation) confirmation.checked = false;
        const consent = dialog?.querySelector('[data-ops-manual-consent]');
        if (consent) consent.checked = false;
        const copy = dialog?.querySelector('[data-ops-manual-copy]');
        if (copy) copy.innerHTML = copyButtonContent(false);
        updateManualSuggestionControls(dialog);
        return;
      }
      if (target.closest('[data-ops-manual-copy]')) {
        const dialog = target.closest('dialog');
        const draft = dialog?.querySelector('[data-ops-manual-text]');
        const confirmation = dialog?.querySelector('[data-ops-manual-confirm]');
        const consent = dialog?.querySelector('[data-ops-manual-consent]');
        const button = target.closest('[data-ops-manual-copy]');
        // A pending clipboard write cannot count as fresh review of an edited
        // draft. Disable reentry and retain the exact human-approved snapshot.
        if (button.disabled || pendingManualClipboardWrites.has(button) || consent?.checked !== true ||
            !mayCopyManualSuggestion(draft?.value, confirmation?.checked)) return;
        const reviewedText = draft.value.trim();
        const reviewedRevision = manualDraftRevisions.get(dialog) ?? 0;
        pendingManualClipboardWrites.add(button);
        button.disabled = true;
        try {
          await copyText(reviewedText);
          // Re-typing identical text is NOT the same reviewed version.
          if ((manualDraftRevisions.get(dialog) ?? 0) === reviewedRevision &&
              draft.value.trim() === reviewedText && confirmation.checked && consent.checked &&
              button.isConnected && root.dataset.opsAuthorized === 'true') {
            button.innerHTML = copyButtonContent(true);
          }
        } finally {
          pendingManualClipboardWrites.delete(button);
          updateManualSuggestionControls(dialog);
        }
        return;
      }
      if (copy) {
        const id = copy.getAttribute('data-ops-copy');
        const text = target.closest('dialog')?.querySelector(`[data-ops-text="${CSS.escape(id || '')}"]`)?.value || '';
        if (text) await copyText(text);
        copy.innerHTML = copyButtonContent(true);
        setTimeout(() => { if (copy.isConnected) copy.innerHTML = copyButtonContent(false); }, 1200);
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('hipico:notice', { detail: { message: error?.message || 'No se pudo completar la acción.' } }));
    }
  });
  root.addEventListener('input', (event) => {
    if (root.dataset.opsAuthorized !== 'true') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches('[data-ops-manual-text]')) {
      const dialog = target.closest('dialog');
      const confirmation = dialog?.querySelector('[data-ops-manual-confirm]');
      const copy = dialog?.querySelector('[data-ops-manual-copy]');
      // Explicit review applies to a particular draft, never to later edits.
      invalidateManualDraftReview(dialog);
      if (confirmation) confirmation.checked = false;
      if (copy) copy.innerHTML = copyButtonContent(false);
      updateManualSuggestionControls(dialog);
    }
  });
  root.addEventListener('change', async (event) => {
    if (root.dataset.opsAuthorized !== 'true') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches('[data-ops-manual-confirm]') || target?.matches('[data-ops-manual-consent]')) {
      const dialog = target.closest('dialog');
      // Any consent/review change invalidates asynchronous clipboard results.
      invalidateManualDraftReview(dialog);
      if (target.matches('[data-ops-manual-consent]')) {
        const confirmation = dialog?.querySelector('[data-ops-manual-confirm]');
        if (confirmation) confirmation.checked = false;
      }
      const copy = dialog?.querySelector('[data-ops-manual-copy]');
      if (copy) copy.innerHTML = copyButtonContent(false);
      updateManualSuggestionControls(dialog);
      return;
    }
    if (root.dataset.opsAuthorized !== 'true') return;
    const select = event.target instanceof Element ? event.target.closest('[data-ops-participant]') : null;
    if (!select) return;
    state.participantId = select.value;
    renderDialog(root);
  });
  return root;
}

export const __test__ = { raceOrdinal, raceOpenText, raceCloseText, sanitizeFilename, buildTexts };