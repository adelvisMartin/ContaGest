import { DEFAULT_RACETRACKS, createBlankWorkspace } from "./seed.js";
import { assertWorkspaceInputSafety } from "./workspace-input-safety.js";
export const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
export const isoNow = () => new Date().toISOString();
export const todayIso = () => isoNow().slice(0, 10);

const DEFAULT_FOOTER = "*PLANO REFERENCIAL*\n*_La guía es el chat_*\n(se gana y se cobra con el chat)\n*USTED ES SU PROPIO CORREDOR*\n*RECLAMOS AL PRIVADO*\n*NO DIGA:* ❌MALO❌; CASA FALTA...\n*TILDE SU JUGADA Y SE REVISARÁ*";
const GROUP_DEFAULTS = [
  { id: "group-1", name: "Grupo principal", companyName: "CONTROL HÍPICO", color: "#721522", currency: "Bs.", exchangeRate: 160, commission: 0.05, footerMessage: DEFAULT_FOOTER }
];
const GROUP_COLORS = ["#721522", "#526f86", "#8d7545", "#35705a"];
const CHAT_IMPORT_SCOPE_PREFIX = "@hipico-group:";

function cleanColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}
function cleanLabel(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
function cleanCommission(value, fallback = 0.05) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}
function cleanExchangeRate(value, fallback = 160) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function normalizeGroup(group, index, config) {
  const base = GROUP_DEFAULTS[index] || {
    id: `group-${index + 1}`,
    name: `Grupo ${index + 1}`,
    companyName: `GRUPO HÍPICO ${index + 1}`,
    color: GROUP_COLORS[index % GROUP_COLORS.length],
    currency: "Bs.", exchangeRate: 160, commission: 0.05, footerMessage: DEFAULT_FOOTER
  };
  const candidateCompany = group?.companyName || group?.clubName || (index === 0 ? config.clubName : base.companyName);
  const fallbackRate = index === 0 ? cleanExchangeRate(config.exchangeRate, base.exchangeRate) : base.exchangeRate;
  const fallbackCommission = index === 0 ? cleanCommission(config.commission, base.commission ?? 0.05) : (base.commission ?? 0.05);
  return {
    id: String(group?.id || base.id),
    name: cleanLabel(group?.name, base.name),
    companyName: cleanLabel(candidateCompany, base.companyName),
    color: cleanColor(group?.color, base.color),
    currency: ["Bs.", "USD"].includes(group?.currency) ? group.currency : (index === 0 && ["Bs.", "USD"].includes(config.currency) ? config.currency : base.currency),
    exchangeRate: cleanExchangeRate(group?.exchangeRate, fallbackRate),
    commission: cleanCommission(group?.commission, fallbackCommission),
    showConversion: group?.showConversion !== false,
    autoRate: group?.autoRate === true,
    footerMessage: String(group?.footerMessage || (index === 0 ? config.footerMessage : base.footerMessage) || base.footerMessage),
    clientLabel: String(group?.clientLabel || "Participantes"),
    active: group?.active !== false
  };
}
function ensureGroups(config) {
  const source = Array.isArray(config.groups) && config.groups.length
    ? config.groups
    : (Array.isArray(config.whatsappGroups) && config.whatsappGroups.length ? config.whatsappGroups : GROUP_DEFAULTS);
  const groups = [...source];
  config.groups = groups.map((group, index) => normalizeGroup(group, index, config));
  config.whatsappGroups = config.groups;
  const preferred = config.activeGroupId || config.activeWhatsappGroupId || config.groups[0].id;
  config.activeGroupId = config.groups.some((group) => group.id === preferred) ? preferred : config.groups[0].id;
  config.activeWhatsappGroupId = config.activeGroupId;
  config.activeRaceByGroup = config.activeRaceByGroup && typeof config.activeRaceByGroup === "object" ? config.activeRaceByGroup : {};
  config.theme = ["light", "dark", "system"].includes(config.theme) ? config.theme : "system";
  config.captureGroupIds = Array.isArray(config.captureGroupIds) ? config.captureGroupIds.filter((id) => config.groups.some((group) => group.id === id && group.active !== false)) : [config.activeGroupId];
  if (!config.captureGroupIds.length) config.captureGroupIds = [config.activeGroupId];
  if (!config.captureGroupIds.includes(config.activeGroupId)) config.captureGroupIds.unshift(config.activeGroupId);
}
function tagGroup(items, fallbackId) {
  for (const item of items || []) item.groupId ||= fallbackId;
}

export function scopedChatImportKey(groupId, matchId) {
  const group = String(groupId || "").trim();
  const match = String(matchId || "").trim();
  if (!group || !match) return "";
  return `${CHAT_IMPORT_SCOPE_PREFIX}${encodeURIComponent(group)}::${match}`;
}

export function parseChatImportKey(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(CHAT_IMPORT_SCOPE_PREFIX)) return { scoped: false, groupId: null, matchId: raw };
  const body = raw.slice(CHAT_IMPORT_SCOPE_PREFIX.length);
  const separator = body.indexOf("::");
  if (separator <= 0) return { scoped: false, groupId: null, matchId: raw };
  try {
    const groupId = decodeURIComponent(body.slice(0, separator));
    const matchId = body.slice(separator + 2);
    if (!groupId || !matchId) return { scoped: false, groupId: null, matchId: raw };
    return { scoped: true, groupId, matchId };
  } catch {
    return { scoped: false, groupId: null, matchId: raw };
  }
}

export class ScopedChatImports extends Array {
  static get [Symbol.species]() { return Array; }

  constructor(entries = [], config = {}) {
    super();
    Object.defineProperty(this, "_config", { value: config, enumerable: false, configurable: false, writable: false });
    const unique = new Set();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const raw = String(entry || "").trim();
      if (!raw || unique.has(raw)) continue;
      unique.add(raw);
      Array.prototype.push.call(this, raw);
    }
  }

  currentGroupId() {
    return String(this._config?.activeGroupId || this._config?.activeWhatsappGroupId || this._config?.groups?.[0]?.id || "group-1");
  }

  *[Symbol.iterator]() {
    const groupId = this.currentGroupId();
    for (let index = 0; index < this.length; index += 1) {
      const parsed = parseChatImportKey(this[index]);
      if (!parsed.matchId) continue;
      if (!parsed.scoped || parsed.groupId === groupId) yield parsed.matchId;
    }
  }

  includes(value) {
    const candidate = String(value || "").trim();
    if (!candidate) return false;
    const parsed = parseChatImportKey(candidate);
    if (parsed.scoped) return Array.prototype.includes.call(this, candidate);
    for (const matchId of this) if (matchId === candidate) return true;
    return false;
  }

  push(...values) {
    const groupId = this.currentGroupId();
    for (const value of values) {
      const candidate = String(value || "").trim();
      if (!candidate) continue;
      const parsed = parseChatImportKey(candidate);
      if (parsed.scoped) {
        if (!Array.prototype.includes.call(this, candidate)) Array.prototype.push.call(this, candidate);
        continue;
      }
      const hasLegacyGlobal = Array.prototype.some.call(this, (entry) => {
        const existing = parseChatImportKey(entry);
        return !existing.scoped && existing.matchId === candidate;
      });
      if (hasLegacyGlobal) continue;
      const key = scopedChatImportKey(groupId, candidate);
      if (key && !Array.prototype.includes.call(this, key)) Array.prototype.push.call(this, key);
    }
    return this.length;
  }
}

export function rateForDate(date, source) {
  const groupId = source?.config?.activeGroupId || source?.config?.activeWhatsappGroupId || "group-1";
  const groups = source?.config?.groups || [];
  const defaultGroupId = groups[0]?.id || "group-1";
  const group = groups.find((item) => item.id === groupId);
  const rates = [...(source?.exchangeRates || [])]
    .filter((rate) => String(rate.groupId || defaultGroupId) === String(groupId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const match = rates.filter((rate) => rate.date <= date).at(-1);
  return cleanExchangeRate(match?.rate, cleanExchangeRate(group?.exchangeRate, cleanExchangeRate(source?.config?.exchangeRate, 1)));
}
export function normalizeWorkspaceShape(value) {
  const workspace = structuredClone(value || createBlankWorkspace());
  workspace.schemaVersion = 10;
  workspace.config ||= {};
  workspace.config.clubName = cleanLabel(workspace.config.clubName, "CONTROL HÍPICO");
  workspace.config.currency ||= "Bs.";
  workspace.config.commission = cleanCommission(workspace.config.commission, 0.05);
  workspace.config.exchangeRate = cleanExchangeRate(workspace.config.exchangeRate, 160);
  workspace.config.footerMessage ||= DEFAULT_FOOTER;
  workspace.config.quickPlays = Array.isArray(workspace.config.quickPlays) && workspace.config.quickPlays.length
    ? workspace.config.quickPlays.map(String) : ["1/2", "1P", "2/2", "2/3", "PP", "PK"];
  workspace.config.quickAmounts = Array.isArray(workspace.config.quickAmounts) && workspace.config.quickAmounts.length
    ? workspace.config.quickAmounts.map(Number).filter(Number.isFinite) : [5000, 10000, 15000, 20000, 30000, 40000];
  workspace.config.racetrackCatalog = Array.isArray(workspace.config.racetrackCatalog) && workspace.config.racetrackCatalog.length
    ? workspace.config.racetrackCatalog.map(String) : [...DEFAULT_RACETRACKS];
  workspace.config.recentRacetracks = Array.isArray(workspace.config.recentRacetracks)
    ? workspace.config.recentRacetracks.map(String) : ["Colonial Downs", "Parx Racing"];
  workspace.config.compactMode = workspace.config.compactMode !== false;
  ensureGroups(workspace.config);
  const defaultGroupId = workspace.config.groups[0].id;
  const activeGroup = workspace.config.groups.find((group) => group.id === workspace.config.activeGroupId) || workspace.config.groups[0];
  workspace.config.commission = activeGroup.commission;
  workspace.config.exchangeRate = activeGroup.exchangeRate;
  workspace.config.currency = activeGroup.currency;
  workspace.config.footerMessage = activeGroup.footerMessage;
  workspace.deviceId ||= crypto.randomUUID();
  workspace.version = Math.max(1, Number(workspace.version || 1));
  workspace.syncMeta = {
    lastSyncedVersion: Number(workspace.syncMeta?.lastSyncedVersion || 0),
    lastSyncedAt: workspace.syncMeta?.lastSyncedAt || null,
    conflictSnapshots: Number(workspace.syncMeta?.conflictSnapshots || 0)
  };
  workspace.participants = Array.isArray(workspace.participants) ? workspace.participants : [];
  tagGroup(workspace.participants, defaultGroupId);
  workspace.participants.forEach((participant) => {
    participant.avalBs = Number(participant.avalBs || 0);
    participant.avalUsd = Number(participant.avalUsd || 0);
    participant.pooled = participant.pooled !== false;
    participant.previousWeekBalance = Number(participant.previousWeekBalance ?? participant.openingBalance ?? 0);
  });
  workspace.days = Array.isArray(workspace.days) ? workspace.days : [];
  tagGroup(workspace.days, defaultGroupId);
  for (const group of workspace.config.groups) {
    if (!workspace.days.some((day) => day.groupId === group.id)) {
      workspace.days.push({ id: createId("day"), groupId: group.id, date: todayIso(), status: "open", closure: null });
    }
  }
  workspace.races = Array.isArray(workspace.races) ? workspace.races : [];
  tagGroup(workspace.races, defaultGroupId);
  workspace.races.forEach((race) => {
    race.board = Array.from({ length: 6 }, (_, index) => String(race.board?.[index] || ""));
    race.boardPositions = Array.from({ length: 6 }, (_, index) => Number(race.boardPositions?.[index] || index + 1));
    race.bets = Array.isArray(race.bets) ? race.bets : [];
    race.bets.forEach((bet) => {
      bet.groupId ||= race.groupId;
      bet.messageStatus ||= "pending";
      bet.source ||= "live";
      bet.messageStatusByGroup ||= Object.fromEntries(workspace.config.groups.map((group) => [group.id, bet.messageStatus]));
    });
    const group = workspace.config.groups.find((item) => item.id === race.groupId);
    race.exchangeRate = cleanExchangeRate(race.exchangeRate, cleanExchangeRate(group?.exchangeRate, 160));
    race.commission = cleanCommission(race.commission, cleanCommission(group?.commission, 0.05));
  });
  workspace.advancedBets = Array.isArray(workspace.advancedBets) ? workspace.advancedBets : [];
  workspace.movements = Array.isArray(workspace.movements) ? workspace.movements : [];
  workspace.exchangeRates = Array.isArray(workspace.exchangeRates) ? workspace.exchangeRates : [];
  workspace.weekClosures = Array.isArray(workspace.weekClosures) ? workspace.weekClosures : [];
  workspace.pollas = Array.isArray(workspace.pollas) ? workspace.pollas : [];
  workspace.audit = Array.isArray(workspace.audit) ? workspace.audit : [];
  workspace.chatImports = new ScopedChatImports(Array.isArray(workspace.chatImports) ? workspace.chatImports : [], workspace.config);
  workspace.syncQueue = Array.isArray(workspace.syncQueue) ? workspace.syncQueue : [];
  for (const list of [workspace.advancedBets, workspace.movements, workspace.exchangeRates, workspace.weekClosures, workspace.pollas, workspace.audit]) tagGroup(list, defaultGroupId);
  for (const rate of workspace.exchangeRates) {
    const group = workspace.config.groups.find((item) => item.id === rate.groupId);
    rate.rate = cleanExchangeRate(rate.rate, cleanExchangeRate(group?.exchangeRate, 1));
  }
  for (const group of workspace.config.groups) {
    if (!workspace.exchangeRates.some((rate) => rate.groupId === group.id)) {
      workspace.exchangeRates.push({ id: createId("rate"), groupId: group.id, date: todayIso(), rate: cleanExchangeRate(group.exchangeRate, 160) });
    }
  }
  for (const group of workspace.config.groups) {
    const current = workspace.config.activeRaceByGroup[group.id];
    if (!current || !workspace.races.some((race) => race.id === current && race.groupId === group.id)) {
      workspace.config.activeRaceByGroup[group.id] = [...workspace.races].reverse().find((race) => race.groupId === group.id)?.id || null;
    }
  }
  workspace.activeRaceId = workspace.config.activeRaceByGroup[workspace.config.activeGroupId] || null;
  assertWorkspaceInputSafety(workspace);
  return workspace;
}
