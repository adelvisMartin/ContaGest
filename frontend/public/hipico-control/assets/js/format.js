import { betCategory, calculateRaceSummary } from "./engine.js";
export function money(value, currency = "Bs.", signed = false) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
  const sign = signed ? (amount > 0 ? "+" : amount < 0 ? "-" : "") : "";
  return `${currency} ${sign}${formatted}`.trim();
}
export function number(value) { return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)); }
export function balanceNumber(value) { const amount = Number(value || 0); return `${amount < 0 ? "-" : ""}${number(Math.abs(amount))}`; }
function dateOnly(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(`${raw}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}
export function shortDate(value) { const date = dateOnly(value); return date ? new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "Sin fecha"; }
function whatsappDate(value) { const date = dateOnly(value); if (!date) return "fecha no disponible"; const weekday = new Intl.DateTimeFormat("es-VE", { weekday: "short" }).format(date).replace(".", "").toLowerCase(); const day = String(date.getDate()).padStart(2, "0"); const month = new Intl.DateTimeFormat("es-VE", { month: "short" }).format(date).replace(".", "").toLowerCase(); return `${weekday}, ${day} de ${month} del ${date.getFullYear()}`; }
function registeredDate(value) { const date = new Date(value || ""); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "numeric", year: "numeric" }).format(date) : "sin fecha"; }
function ordinalRace(value) { const n = Number(value || 1); if (n === 1 || n === 3 || n === 13) return `${n}ra`; if (n === 2) return `${n}da`; return `${n}ta`.replace("10ta", "10ma").replace("11ta", "11ma").replace("12ta", "12ma"); }
function proper(value) { return String(value ?? "").trim().toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function defaultGroupId(workspace) {
  return String(workspace?.config?.groups?.[0]?.id || workspace?.config?.whatsappGroups?.[0]?.id || "group-1");
}
function participantBelongsToGroup(workspace, participant, groupId) {
  return String(participant?.groupId || defaultGroupId(workspace)) === String(groupId);
}
function groupProfile(workspace, race = null) {
  const id = race?.groupId || workspace.config.activeGroupId || workspace.config.activeWhatsappGroupId || defaultGroupId(workspace);
  return workspace.config.groups?.find((group) => group.id === id) || {
    id, companyName: workspace.config.clubName || "CONTROL HÍPICO", currency: workspace.config.currency || "Bs.",
    footerMessage: workspace.config.footerMessage || "", exchangeRate: workspace.config.exchangeRate || 160
  };
}
function raceHeader(workspace, race) {
  const board = (race.board ?? []).filter(Boolean).join(".");
  const retired = (race.retired ?? []).filter(Boolean).join(", ");
  const isVenezuela = ["la rinconada", "valencia"].includes(String(race.racetrack).toLowerCase());
  const flag = isVenezuela ? "🇻🇪" : "🇺🇸";
  const profile = groupProfile(workspace, race);
  return [`*${flag}🏇${profile.companyName}🏇${flag}*`, whatsappDate(race.date), `${race.racetrack}, ${ordinalRace(race.number)} Carrera`, `Ret: ${retired}`, `Pizarra: ${board}${board ? ".." : ""}`];
}
function betLine(bet, participantMap, currency) {
  const player = participantMap.get(bet.playerId); const receiver = participantMap.get(bet.receiverId);
  const amount = number(bet.amount); const horse = String(bet.horse).replace(/\*/g, "x"); const without = bet.without ? `sin (${bet.without}) ` : ""; const settlement = bet.settlement;
  if (!settlement) {
    if (receiver) return `Juega ${proper(player?.code || player?.name)} ${bet.play.toLowerCase()} (${horse}) ${without}con ${amount} da ${proper(receiver.code || receiver.name)}`;
    return [`${bet.play} (${horse}) ${without}con ${amount}`, `Juega ${proper(player?.code || player?.name)}`].join("\n");
  }
  const [leftHorse, rightHorse] = horse.split("x"); const playerLabel = rightHorse ? `(${leftHorse})` : "Juega"; const receiverLabel = rightHorse ? `(${rightHorse})` : "Consigue";
  return [`${bet.play.toLowerCase()} (${horse}) ${without}con ${amount}`, `${playerLabel} ${proper(player?.code || player?.name)} ${money(settlement.playerAmount, currency, true)}`, receiver ? `${receiverLabel} ${proper(receiver.code || receiver.name)} ${money(settlement.receiverAmount, currency, true)}` : ""].filter(Boolean).join("\n");
}
function participantMapForGroup(workspace, groupId) {
  return new Map((workspace.participants || []).filter((participant) => participantBelongsToGroup(workspace, participant, groupId)).map((participant) => [participant.id, participant]));
}
function betReferencesAreScoped(bet, participantMap) {
  const playerId = String(bet?.playerId || '').trim();
  const receiverId = String(bet?.receiverId || '').trim();
  return Boolean(playerId && participantMap.has(playerId) && (!receiverId || participantMap.has(receiverId)));
}
function scopedRaceBets(race, participantMap) {
  return (race?.bets || []).filter((bet) => bet?.status !== "cancelled" && betReferencesAreScoped(bet, participantMap));
}
export function generateWhatsappText(workspace, race) {
  const profile = groupProfile(workspace, race);
  const participantMap = participantMapForGroup(workspace, profile.id);
  const validBets = scopedRaceBets(race, participantMap);
  const categories = new Map();
  for (const bet of validBets) { const category = betCategory(bet); if (!categories.has(category)) categories.set(category, []); categories.get(category).push(bet); }
  const sections = []; for (const [category, bets] of categories.entries()) { sections.push(`*${category}*`); sections.push(bets.map((bet) => betLine(bet, participantMap, profile.currency)).join("\n\n")); }
  const summary = calculateRaceSummary({ ...race, bets: validBets }, participantMap).map((item) => `${item.name.toLowerCase()}  ${money(item.amount, profile.currency, true)}`).join("\n");
  return [...raceHeader(workspace, race), "", ...sections, "", "------------------------------", summary || "Sin movimientos liquidados", "------------------------------", profile.footerMessage].filter((line) => line !== undefined).join("\n").replace(/\n{4,}/g, "\n\n\n");
}
export function generateBetReceiptText(workspace, race, bet) {
  const profile = groupProfile(workspace, race);
  const participantMap = participantMapForGroup(workspace, profile.id);
  if (!betReferencesAreScoped(bet, participantMap)) throw new Error("La jugada referencia participantes fuera del grupo de la carrera.");
  const validBets = scopedRaceBets(race, participantMap);
  const position = validBets.findIndex((item) => item.id === bet.id);
  if (position < 0) throw new Error("La jugada no pertenece a la carrera activa o está anulada.");
  return [...raceHeader(workspace, race), "", betLine(bet, participantMap, profile.currency), "", `Jugada #${position + 1} de ${validBets.length}`, `Registrada: ${registeredDate(bet.createdAt)}`, "", "*TILDE SU JUGADA Y SE REVISARÁ*"].join("\n");
}
export function generateArrivalWhatsappText(workspace, race) {
  const board = (race?.board || []).map(String).map((item) => item.trim()).filter(Boolean);
  if (!race || !board.length) throw new Error("Debe existir una pizarra antes de generar la llegada.");
  return [...raceHeader(workspace, race), "", `🏁 Llegada: ${board.join(".")}..`].join("\n");
}
export function generateBalancesWhatsappText(workspace, rows) {
  const requestedGroupId = String(rows?.find(({ participant }) => participant?.groupId)?.participant?.groupId || workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || defaultGroupId(workspace));
  const profile = groupProfile(workspace, { groupId: requestedGroupId });
  const activeRaceId = workspace?.config?.activeRaceByGroup?.[profile.id] || (profile.id === workspace?.config?.activeGroupId ? workspace?.activeRaceId : null);
  const activeRace = (workspace?.races || []).find((race) => race.id === activeRaceId && String(race.groupId || defaultGroupId(workspace)) === String(profile.id));
  const rate = Number(activeRace?.exchangeRate || profile.exchangeRate || workspace?.config?.exchangeRate || 1);
  const visibleRows = (rows || []).filter(({ participant }) => participant?.active !== false && participantBelongsToGroup(workspace, participant, profile.id)).sort((a, b) => String(a.participant.code).localeCompare(String(b.participant.code), "es"));
  return [`🏇🏻*TERCIO  /  DISPONIBLE*🏇`, ...visibleRows.map(({ participant, available, balance }) => {
    const derivedAvailable = Number(balance || 0) + Number(participant.avalBs || 0) + Number(participant.avalUsd || 0) * rate;
    return `${String(participant.code).toUpperCase()}\t${balanceNumber(available ?? derivedAvailable)}`;
  })].join("\n");
}
export function generateParticipantStatementText(workspace, statement) {
  const profile = groupProfile(workspace, { groupId: statement.groupId || statement.participant?.groupId || defaultGroupId(workspace) });
  const participant = statement.participant || {};
  const date = statement.date || "";
  const dailyRows = Array.isArray(statement.dailyRows) ? statement.dailyRows : [];
  const tracks = Array.isArray(statement.tracks) ? statement.tracks : [];
  const aval = Number(statement.aval || 0);
  const pozo = Number(statement.pozo || 0);
  const week = Number(statement.weekTotal || 0);
  const available = Number(statement.available ?? week + aval + pozo);
  const dayTotal = Number(statement.dayTotal || 0);
  const lines = [
    `Buenas noches tercio, a continuación, su saldo del día ${whatsappDate(date)}`,
    "",
    profile.companyName,
    "----------------------------",
    `Cuentas ${String(participant.code || participant.name || "TERCIO").toUpperCase()}`,
    "----------------------------",
    ...dailyRows.map((row) => `${String(row.date || "")} \\ ${money(row.amount, profile.currency, true)}`),
    "----------------------------",
    "TOTAL GENERAL",
    `• AVAL: ${money(aval, profile.currency, true)}`,
    `• POZO: ${money(pozo, profile.currency, true)}`,
    `• SEMANA: ${money(week, profile.currency, true)}`,
    `• DISPONIBLE: ${money(available, profile.currency, true)}`,
    "----------------------------",
    "Día por hip.",
    ""
  ];
  for (const track of tracks) {
    lines.push(String(track.racetrack || "Hipódromo"));
    for (const race of track.races || []) lines.push(`${ordinalRace(race.number)} \\ ${money(race.amount, profile.currency, true)}`);
    lines.push(`Total \\ ${money(track.total, profile.currency, true)}`, "");
  }
  lines.push("----------------------------", `Tercios \\ ${money(dayTotal, profile.currency, true)}`, "----------------------------", "Total del día", money(dayTotal, profile.currency, true), "", "Por favor confirmar a la brevedad posible.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
export function generateDailySummaryText(workspace, day, stats) {
  const profile = groupProfile(workspace, { groupId: day.groupId || defaultGroupId(workspace) });
  return [`🏇${profile.companyName}🏇`, `*CIERRE DIARIO · ${shortDate(day.date)}*`, `Carreras: ${stats.races}`, `Apuestas: ${stats.bets}`, `Monto registrado: ${money(stats.volume, profile.currency)}`, `Liquidadas: ${stats.settled}`, `Pendientes: ${stats.pending}`, `Anuladas: ${stats.cancelled}`, `Comisión: ${money(stats.commission, profile.currency)}`, `Diferencia de control: ${money(stats.controlDifference, profile.currency, true)}`, `Estado: ${day.status === "closed" ? "CERRADA" : "ABIERTA"}`].join("\n");
}
export function csvEscape(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

export const __test__ = { dateOnly, whatsappDate, registeredDate, groupProfile, defaultGroupId, participantBelongsToGroup, participantMapForGroup, betReferencesAreScoped, scopedRaceBets };