export const SAFE_INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const SAFE_BOARD_TOKEN = /^[A-Za-z0-9][A-Za-z0-9*._/+:-]{0,23}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RACE_STATUSES = new Set(['open', 'locked', 'settled', 'closed']);
const BET_STATUSES = new Set(['pending', 'settled', 'cancelled']);
const DAY_STATUSES = new Set(['open', 'closed']);
const ADVANCED_STATUSES = new Set(['staged', 'loaded']);
const POLLA_STATUSES = new Set(['open', 'closed']);

function safetyError(message, code, path) {
  return Object.assign(new Error(message), { code, path });
}

function assertSafeId(value, path) {
  if (value == null || value === '') return;
  if (!SAFE_INTERNAL_ID.test(String(value))) {
    throw safetyError(`Identificador interno inválido en ${path}.`, 'HIPICO_WORKSPACE_UNSAFE_IDENTIFIER', path);
  }
}

function validIsoDate(value) {
  const text = String(value || '');
  if (!ISO_DATE.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function assertSafeDate(value, path) {
  if (value == null || value === '') return;
  if (!validIsoDate(value)) throw safetyError(`Fecha inválida en ${path}.`, 'HIPICO_WORKSPACE_UNSAFE_DATE', path);
}

function assertEnum(value, allowed, path) {
  if (value == null || value === '') return;
  if (!allowed.has(String(value))) throw safetyError(`Estado inválido en ${path}.`, 'HIPICO_WORKSPACE_UNSAFE_STATE', path);
}

function assertRaceNumber(value, path) {
  if (value == null || value === '') return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 999) {
    throw safetyError(`Número de carrera inválido en ${path}.`, 'HIPICO_WORKSPACE_UNSAFE_RACE_NUMBER', path);
  }
}

export function assertSafeBoardToken(value, path = 'board') {
  const text = String(value || '').trim();
  if (!text) return;
  if (!SAFE_BOARD_TOKEN.test(text)) {
    throw safetyError(`Identificador de caballo inválido en ${path}. Usa sólo letras, números y separadores operativos.`, 'HIPICO_WORKSPACE_UNSAFE_BOARD_TOKEN', path);
  }
}

function assertRowIds(row, path, keys) {
  if (!row || typeof row !== 'object') return;
  for (const key of keys) assertSafeId(row[key], `${path}.${key}`);
}

function assertCollectionDates(rows, collection, keys = ['date']) {
  for (let index = 0; index < (rows || []).length; index += 1) {
    for (const key of keys) assertSafeDate(rows[index]?.[key], `${collection}[${index}].${key}`);
  }
}

export function assertWorkspaceInputSafety(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw safetyError('Workspace Hípico inválido.', 'HIPICO_WORKSPACE_INVALID', 'workspace');
  }
  const config = workspace.config || {};
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const legacyGroups = Array.isArray(config.whatsappGroups) ? config.whatsappGroups : [];
  [...groups, ...legacyGroups].forEach((group, index) => assertSafeId(group?.id, `config.groups[${index}].id`));
  assertSafeId(config.activeGroupId, 'config.activeGroupId');
  assertSafeId(config.activeWhatsappGroupId, 'config.activeWhatsappGroupId');
  assertSafeId(workspace.activeRaceId, 'activeRaceId');
  for (const [groupId, raceId] of Object.entries(config.activeRaceByGroup || {})) {
    assertSafeId(groupId, 'config.activeRaceByGroup.<groupId>');
    assertSafeId(raceId, `config.activeRaceByGroup.${groupId}`);
  }
  for (const [index, groupId] of (config.captureGroupIds || []).entries()) assertSafeId(groupId, `config.captureGroupIds[${index}]`);

  const participants = workspace.participants || [];
  participants.forEach((row, index) => assertRowIds(row, `participants[${index}]`, ['id', 'groupId']));

  const days = workspace.days || [];
  days.forEach((row, index) => {
    assertRowIds(row, `days[${index}]`, ['id', 'groupId']);
    assertEnum(row?.status, DAY_STATUSES, `days[${index}].status`);
  });
  assertCollectionDates(days, 'days');

  const races = workspace.races || [];
  races.forEach((race, raceIndex) => {
    assertRowIds(race, `races[${raceIndex}]`, ['id', 'groupId', 'dayId']);
    assertRaceNumber(race?.number, `races[${raceIndex}].number`);
    assertEnum(race?.status, RACE_STATUSES, `races[${raceIndex}].status`);
    (race?.board || []).forEach((token, index) => assertSafeBoardToken(token, `races[${raceIndex}].board[${index}]`));
    (race?.retired || []).forEach((token, index) => assertSafeBoardToken(token, `races[${raceIndex}].retired[${index}]`));
    for (let index = 0; index < (race?.boardPositions || []).length; index += 1) {
      const position = Number(race.boardPositions[index]);
      if (!Number.isInteger(position) || position < 1 || position > 6) {
        throw safetyError(`Posición de pizarra inválida en races[${raceIndex}].boardPositions[${index}].`, 'HIPICO_WORKSPACE_UNSAFE_BOARD_POSITION', `races[${raceIndex}].boardPositions[${index}]`);
      }
    }
    (race?.bets || []).forEach((bet, betIndex) => {
      assertRowIds(bet, `races[${raceIndex}].bets[${betIndex}]`, ['id', 'groupId', 'playerId', 'receiverId']);
      assertEnum(bet?.status, BET_STATUSES, `races[${raceIndex}].bets[${betIndex}].status`);
    });
  });
  assertCollectionDates(races, 'races');

  const advanced = workspace.advancedBets || [];
  advanced.forEach((row, index) => {
    assertRowIds(row, `advancedBets[${index}]`, ['id', 'groupId', 'playerId', 'receiverId', 'loadedRaceId']);
    assertRaceNumber(row?.raceNumber, `advancedBets[${index}].raceNumber`);
    assertEnum(row?.status, ADVANCED_STATUSES, `advancedBets[${index}].status`);
  });
  assertCollectionDates(advanced, 'advancedBets');

  const movements = workspace.movements || [];
  movements.forEach((row, index) => assertRowIds(row, `movements[${index}]`, ['id', 'groupId', 'dayId', 'participantId', 'counterpartyId']));
  assertCollectionDates(movements, 'movements');

  const rates = workspace.exchangeRates || [];
  rates.forEach((row, index) => assertRowIds(row, `exchangeRates[${index}]`, ['id', 'groupId']));
  assertCollectionDates(rates, 'exchangeRates');

  const weeks = workspace.weekClosures || [];
  weeks.forEach((row, index) => {
    assertRowIds(row, `weekClosures[${index}]`, ['id', 'groupId']);
    (row?.balances || []).forEach((balance, balanceIndex) => assertRowIds(balance, `weekClosures[${index}].balances[${balanceIndex}]`, ['participantId']));
  });
  assertCollectionDates(weeks, 'weekClosures', ['date', 'from', 'to']);

  const pollas = workspace.pollas || [];
  pollas.forEach((row, index) => {
    assertRowIds(row, `pollas[${index}]`, ['id', 'groupId']);
    assertEnum(row?.status, POLLA_STATUSES, `pollas[${index}].status`);
    (row?.entries || []).forEach((entry, entryIndex) => assertRowIds(entry, `pollas[${index}].entries[${entryIndex}]`, ['id', 'participantId']));
  });
  assertCollectionDates(pollas, 'pollas');

  (workspace.audit || []).forEach((row, index) => assertRowIds(row, `audit[${index}]`, ['id', 'groupId']));
  (workspace.syncQueue || []).forEach((row, index) => assertRowIds(row, `syncQueue[${index}]`, ['id', 'groupId']));
  return workspace;
}

function rejectBoardSubmit(form) {
  for (let index = 0; index < 6; index += 1) {
    const input = form.elements.namedItem(`horse${index}`);
    if (!input) continue;
    try { assertSafeBoardToken(input.value, `board-form.horse${index}`); }
    catch (error) {
      input.setCustomValidity?.(error.message);
      input.reportValidity?.();
      input.focus?.();
      throw error;
    }
  }
  const retired = form.elements.namedItem('retired');
  for (const token of String(retired?.value || '').split(',').map((value) => value.trim()).filter(Boolean)) {
    try { assertSafeBoardToken(token, 'board-form.retired'); }
    catch (error) {
      retired?.setCustomValidity?.(error.message);
      retired?.reportValidity?.();
      retired?.focus?.();
      throw error;
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('input', (event) => {
    const input = event.target;
    if (input?.form?.id === 'board-form') input.setCustomValidity?.('');
  }, true);
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'board-form') return;
    try { rejectBoardSubmit(form); }
    catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      globalThis.dispatchEvent?.(new CustomEvent('hipico:notice', { detail: { message: error.message, type: 'error' } }));
    }
  }, true);
}

export const __test__ = { validIsoDate, assertSafeId, assertSafeDate, assertRaceNumber, rejectBoardSubmit };
