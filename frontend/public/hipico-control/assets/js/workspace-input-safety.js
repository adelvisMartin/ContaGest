export const SAFE_INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const SAFE_BOARD_TOKEN = /^[A-Za-z0-9][A-Za-z0-9*._/+:-]{0,23}$/;
export const SAFE_GROUP_COLOR = /^#[0-9A-Fa-f]{6}$/;
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

export function assertSafeGroupColor(value, path = 'config.groups.color') {
  if (value == null || value === '') return;
  if (!SAFE_GROUP_COLOR.test(String(value))) {
    throw safetyError(`Color de grupo inválido en ${path}.`, 'HIPICO_WORKSPACE_UNSAFE_GROUP_COLOR', path);
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

function assertGroup(group, path) {
  if (!group || typeof group !== 'object') return;
  assertSafeId(group.id, `${path}.id`);
  assertSafeGroupColor(group.color, `${path}.color`);
}

function canonicalGroups(config) {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  if (groups.length) return groups;
  return Array.isArray(config?.whatsappGroups) ? config.whatsappGroups : [];
}

function configuredGroupIds(config) {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  const legacyGroups = Array.isArray(config?.whatsappGroups) ? config.whatsappGroups : [];
  groups.forEach((group, index) => assertGroup(group, `config.groups[${index}]`));
  legacyGroups.forEach((group, index) => assertGroup(group, `config.whatsappGroups[${index}]`));

  const ids = new Set();
  const canonical = canonicalGroups(config);
  for (let index = 0; index < canonical.length; index += 1) {
    const groupId = String(canonical[index]?.id || '').trim();
    const collection = groups.length ? 'config.groups' : 'config.whatsappGroups';
    assertSafeId(groupId, `${collection}[${index}].id`);
    if (!groupId) throw safetyError(`Grupo sin identificador en ${collection}[${index}].`, 'HIPICO_WORKSPACE_GROUP_ID_REQUIRED', `${collection}[${index}].id`);
    if (ids.has(groupId)) throw safetyError(`Identificador de grupo duplicado: ${groupId}.`, 'HIPICO_WORKSPACE_DUPLICATE_GROUP', `${collection}[${index}].id`);
    ids.add(groupId);
  }
  return ids;
}

function assertKnownGroup(value, path, groupIds) {
  if (value == null || value === '') return;
  const groupId = String(value);
  assertSafeId(groupId, path);
  if (!groupIds.has(groupId)) {
    throw safetyError(`Referencia a grupo inexistente en ${path}.`, 'HIPICO_WORKSPACE_UNKNOWN_GROUP', path);
  }
}

export function assertWorkspaceInputSafety(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    throw safetyError('Workspace Hípico inválido.', 'HIPICO_WORKSPACE_INVALID', 'workspace');
  }
  const config = workspace.config || {};
  const groupIds = configuredGroupIds(config);
  assertKnownGroup(config.activeGroupId, 'config.activeGroupId', groupIds);
  assertKnownGroup(config.activeWhatsappGroupId, 'config.activeWhatsappGroupId', groupIds);
  assertSafeId(workspace.activeRaceId, 'activeRaceId');
  for (const [groupId, raceId] of Object.entries(config.activeRaceByGroup || {})) {
    assertKnownGroup(groupId, 'config.activeRaceByGroup.<groupId>', groupIds);
    assertSafeId(raceId, `config.activeRaceByGroup.${groupId}`);
  }
  for (const [index, groupId] of (config.captureGroupIds || []).entries()) assertKnownGroup(groupId, `config.captureGroupIds[${index}]`, groupIds);

  const participants = workspace.participants || [];
  participants.forEach((row, index) => {
    assertRowIds(row, `participants[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `participants[${index}].groupId`, groupIds);
  });

  const days = workspace.days || [];
  days.forEach((row, index) => {
    assertRowIds(row, `days[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `days[${index}].groupId`, groupIds);
    assertEnum(row?.status, DAY_STATUSES, `days[${index}].status`);
  });
  assertCollectionDates(days, 'days');

  const races = workspace.races || [];
  races.forEach((race, raceIndex) => {
    assertRowIds(race, `races[${raceIndex}]`, ['id', 'groupId', 'dayId']);
    assertKnownGroup(race?.groupId, `races[${raceIndex}].groupId`, groupIds);
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
      assertKnownGroup(bet?.groupId, `races[${raceIndex}].bets[${betIndex}].groupId`, groupIds);
      if (bet?.groupId && race?.groupId && String(bet.groupId) !== String(race.groupId)) {
        throw safetyError(`Apuesta fuera del grupo de su carrera en races[${raceIndex}].bets[${betIndex}].`, 'HIPICO_WORKSPACE_CROSS_GROUP_BET', `races[${raceIndex}].bets[${betIndex}].groupId`);
      }
      assertEnum(bet?.status, BET_STATUSES, `races[${raceIndex}].bets[${betIndex}].status`);
    });
  });
  assertCollectionDates(races, 'races');

  const advanced = workspace.advancedBets || [];
  advanced.forEach((row, index) => {
    assertRowIds(row, `advancedBets[${index}]`, ['id', 'groupId', 'playerId', 'receiverId', 'loadedRaceId']);
    assertKnownGroup(row?.groupId, `advancedBets[${index}].groupId`, groupIds);
    assertRaceNumber(row?.raceNumber, `advancedBets[${index}].raceNumber`);
    assertEnum(row?.status, ADVANCED_STATUSES, `advancedBets[${index}].status`);
  });
  assertCollectionDates(advanced, 'advancedBets');

  const movements = workspace.movements || [];
  movements.forEach((row, index) => {
    assertRowIds(row, `movements[${index}]`, ['id', 'groupId', 'dayId', 'participantId', 'counterpartyId']);
    assertKnownGroup(row?.groupId, `movements[${index}].groupId`, groupIds);
  });
  assertCollectionDates(movements, 'movements');

  const rates = workspace.exchangeRates || [];
  rates.forEach((row, index) => {
    assertRowIds(row, `exchangeRates[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `exchangeRates[${index}].groupId`, groupIds);
  });
  assertCollectionDates(rates, 'exchangeRates');

  const weeks = workspace.weekClosures || [];
  weeks.forEach((row, index) => {
    assertRowIds(row, `weekClosures[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `weekClosures[${index}].groupId`, groupIds);
    (row?.balances || []).forEach((balance, balanceIndex) => assertRowIds(balance, `weekClosures[${index}].balances[${balanceIndex}]`, ['participantId']));
  });
  assertCollectionDates(weeks, 'weekClosures', ['date', 'from', 'to']);

  const pollas = workspace.pollas || [];
  pollas.forEach((row, index) => {
    assertRowIds(row, `pollas[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `pollas[${index}].groupId`, groupIds);
    assertEnum(row?.status, POLLA_STATUSES, `pollas[${index}].status`);
    (row?.entries || []).forEach((entry, entryIndex) => assertRowIds(entry, `pollas[${index}].entries[${entryIndex}]`, ['id', 'participantId']));
  });
  assertCollectionDates(pollas, 'pollas');

  (workspace.audit || []).forEach((row, index) => {
    assertRowIds(row, `audit[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `audit[${index}].groupId`, groupIds);
  });
  (workspace.syncQueue || []).forEach((row, index) => {
    assertRowIds(row, `syncQueue[${index}]`, ['id', 'groupId']);
    assertKnownGroup(row?.groupId, `syncQueue[${index}].groupId`, groupIds);
  });
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

export const __test__ = { validIsoDate, assertSafeId, assertSafeDate, assertRaceNumber, assertSafeGroupColor, configuredGroupIds, assertKnownGroup, rejectBoardSubmit };
