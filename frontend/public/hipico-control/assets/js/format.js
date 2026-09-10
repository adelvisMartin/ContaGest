import { betCategory, calculateRaceSummary } from "./engine.js";
export function money(value, currency = "Bs.", signed = false) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount));
  const sign = signed ? (amount > 0 ? "+" : amount < 0 ? "-" : "") : "";
  return `${currency} ${sign}${formatted}`.trim();
}
export function number(value) { return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)); }
export function balanceNumber(value) { const amount = Number(value || 0); return `${amount < 0 ? "-" : ""}${number(Math.abs(amount))}`; }
export function shortDate(value) { const date = new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function whatsappDate(value) { const date = new Date(`${value}T12:00:00`); const weekday = new Intl.DateTimeFormat("es-VE", { weekday: "short" }).format(date).replace(".", "").toLowerCase(); const day = String(date.getDate()).padStart(2, "0"); const month = new Intl.DateTimeFormat("es-VE", { month: "short" }).format(date).replace(".", "").toLowerCase(); return `${weekday}, ${day} de ${month} del ${date.getFullYear()}`; }
function registeredDate(value) { return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value || Date.now())); }
function ordinalRace(value) { const n = Number(value || 1); if (n === 1 || n === 3 || n === 13) return `${n}ra`; if (n === 2) return `${n}da`; return `${n}ta`.replace("10ta", "10ma").replace("11ta", "11ma").replace("12ta", "12ma"); }
function proper(value) { return String(value ?? "").trim().toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function groupProfile(workspace, race = null) {
  const id = race?.groupId || workspace.config.activeGroupId || workspace.config.activeWhatsappGroupId || "group-1";
  return workspace.config.groups?.find((group) => group.id === id) || {
    id, companyName: workspace.config.clubName || "CLUB HIPICO TRIPLE CROWN", currency: workspace.config.currency || "Bs.",
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
export function generateWhatsappText(workspace, race) {
  const profile = groupProfile(workspace, race);
  const participantMap = new Map(workspace.participants.filter((participant) => !participant.groupId || participant.groupId === profile.id).map((participant) => [participant.id, participant]));
  const categories = new Map();
  for (const bet of race.bets ?? []) { if (bet.status === "cancelled") continue; const category = betCategory(bet); if (!categories.has(category)) categories.set(category, []); categories.get(category).push(bet); }
  const sections = []; for (const [category, bets] of categories.entries()) { sections.push(`*${category}*`); sections.push(bets.map((bet) => betLine(bet, participantMap, profile.currency)).join("\n\n")); }
  const summary = calculateRaceSummary(race, participantMap).map((item) => `${item.name.toLowerCase()}  ${money(item.amount, profile.currency, true)}`).join("\n");
  return [...raceHeader(workspace, race), "", ...sections, "", "------------------------------", summary || "Sin movimientos liquidados", "------------------------------", profile.footerMessage].filter((line) => line !== undefined).join("\n").replace(/\n{4,}/g, "\n\n\n");
}
export function generateBetReceiptText(workspace, race, bet) {
  const profile = groupProfile(workspace, race);
  const participantMap = new Map(workspace.participants.filter((participant) => !participant.groupId || participant.groupId === profile.id).map((participant) => [participant.id, participant]));
  const validBets = (race.bets || []).filter((item) => item.status !== "cancelled");
  return [...raceHeader(workspace, race), "", betLine(bet, participantMap, profile.currency), "", `Jugada #${validBets.findIndex((item) => item.id === bet.id) + 1} de ${validBets.length}`, `Registrada: ${registeredDate(bet.createdAt)}`, "", "*TILDE SU JUGADA Y SE REVISARÁ*"].join("\n");
}
export function generateArrivalWhatsappText(workspace, race) {
  const board = (race?.board || []).map(String).map((item) => item.trim()).filter(Boolean);
  if (!race || !board.length) throw new Error("Debe existir una pizarra antes de generar la llegada.");
  return [...raceHeader(workspace, race), "", `🏁 Llegada: ${board.join(".")}..`].join("\n");
}
export function generateBalancesWhatsappText(workspace, rows) {
  const visibleRows = rows.filter(({ participant }) => participant.active !== false).sort((a, b) => String(a.participant.code).localeCompare(String(b.participant.code), "es"));
  return [`🏇🏻*TERCIO  /  DISPONIBLE*🏇`, ...visibleRows.map(({ participant, available, balance }) => `${String(participant.code).toUpperCase()}\t${balanceNumber(available ?? balance)}`)].join("\n");
}
export function generateParticipantStatementText(workspace, statement) {
  const profile = groupProfile(workspace, { groupId: statement.groupId || statement.participant?.groupId });
  const participant = statement.participant || {};
  const date = statement.date || new Date().toISOString().slice(0, 10);
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
  const profile = groupProfile(workspace, { groupId: day.groupId });
  return [`🏇${profile.companyName}🏇`, `*CIERRE DIARIO · ${shortDate(day.date)}*`, `Carreras: ${stats.races}`, `Apuestas: ${stats.bets}`, `Monto registrado: ${money(stats.volume, profile.currency)}`, `Liquidadas: ${stats.settled}`, `Pendientes: ${stats.pending}`, `Anuladas: ${stats.cancelled}`, `Comisión: ${money(stats.commission, profile.currency)}`, `Diferencia de control: ${money(stats.controlDifference, profile.currency, true)}`, `Estado: ${day.status === "closed" ? "CERRADA" : "ABIERTA"}`].join("\n");
}
export function csvEscape(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
