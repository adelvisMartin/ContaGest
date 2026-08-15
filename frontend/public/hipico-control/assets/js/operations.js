import './rc1-recovery.js';

const CLOSE_RE = /NO\s+MAS\s+JUGAD|CARRERA\s+CERRADA|CERRADO\s+CERRADO/i;
const DAY_CLOSE_RE = /ESTO\s+ES\s+TODO\s+POR\s+EL\s+D[IÍ]A\s+DE\s+HOY|LOS\s+ESPERAMOS\s+MA[NÑ]ANA|CIERRE\s+DE\s+JORNADA/i;
const BALANCE_HEADER_RE = /\bTERCIO\s+DISPONIBLE\b/i;
const MONEY_RE = /^\s*([^\t\n]+?)\s+(?:Bs\.?\s*)?([+-]?[\d.]+(?:,\d{1,2})?)\s*$/i;

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function canonical(value) {
  return plain(value).toUpperCase().replace(/[“”"'`]/g, "").replace(/\s+/g, " ").trim();
}
function hash32(value) {
  let h = 0x811c9dc5;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function parseNumber(raw) {
  const text = String(raw || "").trim().replace(/\./g, "").replace(",", ".");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function planFingerprint(text) {
  const all = String(text || "").split(/\n+/).map(canonical).filter(Boolean);
  const betLines = all.filter((line) => /^JUEGA\s+.+\s+CON\s+[\d.,]+\s+DA\s+/.test(line));
  const lines = betLines.length ? betLines : all.filter((line) => !/^PIZARRA\s*:/.test(line) && !/^LLEGADA\b/.test(line) && !/^DOM|^LUN|^MAR|^MIE|^JUE|^VIE|^SAB/.test(line));
  return `PLAN-${hash32(lines.join("|"))}`;
}
function parseBalances(text) {
  if (!BALANCE_HEADER_RE.test(canonical(text))) return [];
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => BALANCE_HEADER_RE.test(canonical(line)));
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(MONEY_RE);
    if (!match) continue;
    const value = parseNumber(match[2]);
    if (value === null) continue;
    rows.push({ participant: match[1].trim(), available: value });
  }
  return rows;
}
function parseSettlement(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  let current = null;
  for (const line of lines) {
    const bet = line.match(/^(.+?)\s*\(([^)]+)\)\s+con\s+([\d.]+(?:,\d{1,2})?)/i);
    if (bet) {
      current = { play: bet[1].trim(), horse: bet[2].trim(), amount: parseNumber(bet[3]), player: null, receiver: null };
      rows.push(current);
      continue;
    }
    if (!current) continue;
    const side = line.match(/^(Juega|Consigue)\s+(.+?)\s+Bs\.?\s+([+-]?[\d.]+(?:,\d{1,2})?)/i);
    if (!side) continue;
    const payload = { name: side[2].trim(), amount: parseNumber(side[3]) };
    if (/^JUEGA$/i.test(side[1])) current.player = payload;
    else current.receiver = payload;
  }
  return rows.filter((row) => row.player || row.receiver);
}
function typeFor(message) {
  const text = String(message?.text || "");
  const c = canonical(text);
  const balances = parseBalances(text);
  if (balances.length >= 2) return { type: "balance_snapshot", balances };
  if (DAY_CLOSE_RE.test(c)) return { type: "day_close" };
  if (CLOSE_RE.test(c)) return { type: "race_close" };
  const settlement = parseSettlement(text);
  if (settlement.length && /\bTERCIOS\b/.test(c)) return { type: "settlement_snapshot", settlement, fingerprint: planFingerprint(text) };
  if (/\bTERCIOS\b/.test(c) && /\bJUEGA\b/.test(c)) return { type: "plan_snapshot", fingerprint: planFingerprint(text) };
  if (message?.type === "reply") return { type: "reply_review" };
  if (message?.type === "offer") return { type: "offer" };
  return { type: "other" };
}

export function analyzeOperationalFeed(analysis, options = {}) {
  if (!analysis) return null;
  const events = [];
  const seenPlans = new Set();
  const seenResults = new Set();
  let closed = false;
  let duplicatePlans = 0;
  let lateOffers = 0;
  for (const message of analysis.messages || []) {
    const typed = typeFor(message);
    const messageEvents = [];
    if (Array.isArray(message.board) && message.board.length) messageEvents.push({ type: "result", board: message.board });
    if (typed.type !== "other" || !messageEvents.length) messageEvents.push(typed);
    for (const candidate of messageEvents) {
      let status = "accepted";
      if (["plan_snapshot", "settlement_snapshot"].includes(candidate.type) && candidate.fingerprint) {
        if (seenPlans.has(candidate.fingerprint)) { status = "duplicate"; duplicatePlans += 1; }
        else seenPlans.add(candidate.fingerprint);
      }
      if (candidate.type === "result" && candidate.board?.length) {
        const boardKey = candidate.board.join(".");
        if (seenResults.has(boardKey)) status = "duplicate";
        else seenResults.add(boardKey);
      }
      if (candidate.type === "race_close") closed = true;
      if (candidate.type === "offer" && closed) { status = "late_or_next_block"; lateOffers += 1; }
      events.push({
        id: `OPS-${message.id}-${candidate.type}`,
        messageId: message.id,
        timestamp: message.timestamp,
        sender: message.sender,
        segmentId: message.segmentId || 1,
        status,
        ...candidate
      });
    }
  }
  const needsReview =
    Number(analysis.pendingConfirmations?.length || 0) +
    Number(analysis.unmatched?.length || 0) +
    Number((analysis.matches || []).filter((match) => match.requiresApproval).length || 0);
  const balances = events.filter((event) => event.type === "balance_snapshot" && event.status !== "duplicate").at(-1)?.balances || [];
  const settlement = events.filter((event) => event.type === "settlement_snapshot" && event.status !== "duplicate").at(-1)?.settlement || [];
  const board = events.filter((event) => event.type === "result" && event.status !== "duplicate").at(-1)?.board || [];
  return {
    events,
    stats: {
      automated: Math.max(0, (analysis.messages?.length || 0) - needsReview),
      needsReview,
      duplicatePlans,
      lateOffers,
      balanceRows: balances.length,
      settlementRows: settlement.length,
      results: board.length ? 1 : 0
    },
    lastBalanceSnapshot: balances,
    lastSettlementSnapshot: settlement,
    lastBoard: board,
    raceState: events.some((event) => event.type === "day_close") ? "JORNADA CERRADA"
      : events.some((event) => event.type === "settlement_snapshot") ? "LIQUIDACIÓN RECIBIDA"
      : events.some((event) => event.type === "result") ? "RESULTADO RECIBIDO"
      : events.some((event) => event.type === "race_close") ? "CARRERA CERRADA"
      : "RECEPCIÓN"
  };
}

export function operationLabel(type) {
  const labels = {
    race_close: "Cierre de carrera",
    day_close: "Cierre de jornada",
    plan_snapshot: "Plano publicado",
    settlement_snapshot: "Liquidación publicada",
    balance_snapshot: "Disponibles publicados",
    result: "Llegada / pizarra",
    reply_review: "Respuesta citada",
    offer: "Oferta"
  };
  return labels[type] || "Mensaje";
}
