var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
const TYPE_BY_PREFIX = new Map([
    ["#", 5], ["1/2", 3], ["10A", 7], ["1P", 1], ["2/2", 2], ["2/3", 3],
    ["2N", 4], ["2P", 1], ["3/3", 2], ["3/4", 3], ["3N", 4], ["3P", 1],
    ["4/4", 2], ["4/5", 3], ["4N", 4], ["4P", 1], ["5/5", 2], ["5/6", 3],
    ["5N", 4], ["5P", 1], ["6/6", 2], ["6N", 4], ["6P", 1], ["LOG", 12],
    ["MAR", 10], ["PK", 9], ["PLA", 6], ["PP", 8], ["RET", 13], ["TF", 14], ["SHO", 15]
]);
export const BET_OPTIONS = [
    "1/2", "1P", "2/2", "2/3", "2N", "2P", "3/3", "3/4", "3N", "3P",
    "4/4", "4/5", "4N", "4P", "5/5", "5/6", "5N", "5P", "6/6", "6N", "6P",
    "PP", "PK", "MAR", "PLA", "SHOW", "RET", "TF", "LOGRO", "10A"
];
export function parseAmount(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const raw = String(value !== null && value !== void 0 ? value : "").trim().toUpperCase().replace(/\s/g, "");
    if (!raw)
        return 0;
    const multiplier = raw.endsWith("M") ? 1000000 : raw.endsWith("K") ? 1000 : 1;
    const clean = raw.replace(/[KM]$/, "").replace(/\./g, "").replace(",", ".");
    const number = Number(clean);
    return Number.isFinite(number) ? number * multiplier : 0;
}
export function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
export function normalizePlay(play) {
    return String(play !== null && play !== void 0 ? play : "").trim().toUpperCase().replace(/\s+/g, " ");
}
export function betTypeId(play, horse = "") {
    const normalized = normalizePlay(play);
    if (!normalized)
        return 16;
    if (normalized.includes("TF"))
        return 14;
    if (normalized.includes("SHOW") || normalized.startsWith("SHO"))
        return 15;
    if ((normalized.includes("+") || normalized.includes("-")) && !normalized.includes("/"))
        return 12;
    const prefix = [...TYPE_BY_PREFIX.keys()].sort((a, b) => b.length - a.length)
        .find((key) => normalized.startsWith(key));
    let type = prefix ? TYPE_BY_PREFIX.get(prefix) : 17;
    if (type === 7 && String(horse).includes("*"))
        type = 11;
    return type;
}
export function betCategory(bet) {
    if (bet.receiverId)
        return "TERCIOS";
    const type = betTypeId(bet.play, bet.horse);
    if ([9, 10].includes(type))
        return "MARCAS";
    if (type === 6)
        return "GANADORES";
    if (type === 13)
        return "RETIROS";
    if (type === 14)
        return "TABLAS FIJAS";
    if (type === 15)
        return "PUESTOS FIJOS";
    return "TAQUILLA";
}
export function parseHorseTokens(value) {
    return String(value !== null && value !== void 0 ? value : "").toUpperCase().replace(/X/g, "*").split(",")
        .map((token) => token.trim()).filter(Boolean);
}
function splitHorseSides(horse) {
    const normalized = String(horse !== null && horse !== void 0 ? horse : "").toUpperCase().replace(/X/g, "*");
    const [left = "", right = ""] = normalized.split("*");
    return { left: parseHorseTokens(left), right: parseHorseTokens(right) };
}
function raceEntries(race) {
    const board = Array.from({ length: 6 }, (_, index) => { var _a, _b; return String((_b = (_a = race.board) === null || _a === void 0 ? void 0 : _a[index]) !== null && _b !== void 0 ? _b : "").trim(); });
    const positions = Array.from({ length: 6 }, (_, index) => {
        var _a;
        const value = Number((_a = race.boardPositions) === null || _a === void 0 ? void 0 : _a[index]);
        return Number.isFinite(value) && value > 0 ? value : index + 1;
    });
    return board.map((horse, index) => ({ horse, position: positions[index], index })).filter((entry) => entry.horse);
}
function positionOf(token, race) {
    var _a;
    const entry = raceEntries(race).find((item) => item.horse === String(token));
    return (_a = entry === null || entry === void 0 ? void 0 : entry.position) !== null && _a !== void 0 ? _a : 7;
}
function excludedPositions(without, race) {
    return without.map((horse) => positionOf(horse, race)).filter((position) => position < 7);
}
function adjustedNormalPosition(token, race, retired, without) {
    if (retired.includes(token))
        return "RET";
    const original = positionOf(token, race);
    if (original === 7)
        return 7;
    const removedBefore = excludedPositions(without, race).filter((position) => position < original).length;
    return Math.max(1, original - removedBefore);
}
function mode(values) {
    const counts = new Map();
    let winner = null;
    let max = 0;
    for (const value of values) {
        const next = (counts.get(value) || 0) + 1;
        counts.set(value, next);
        if (next > max) {
            max = next;
            winner = value;
        }
    }
    return max > 1 ? winner : null;
}
function minNormalPosition(tokens, race, retired, without) {
    const normal = tokens.filter((token) => !["PA", "IM", "RE"].includes(token));
    if (!normal.length)
        return 7;
    const positions = normal.map((token) => adjustedNormalPosition(token, race, retired, without));
    if (positions.includes("RET"))
        return "RET";
    return Math.min(...positions);
}
function parityPosition(kind, race, without) {
    var _a, _b;
    const entries = raceEntries(race);
    const excluded = excludedPositions(without, race);
    const reference = excluded.length && Math.min(...excluded) === 1 ? (_a = entries[1]) === null || _a === void 0 ? void 0 : _a.horse : (_b = entries[0]) === null || _b === void 0 ? void 0 : _b.horse;
    const isEven = Number(reference) % 2 === 0;
    if (kind === "PA")
        return isEven ? 1 : 2;
    return isEven ? 2 : 1;
}
function leftPosition(tokens, race, retired, without) {
    if (tokens.includes("PA"))
        return parityPosition("PA", race, without);
    if (tokens.includes("IM"))
        return parityPosition("IM", race, without);
    return minNormalPosition(tokens, race, retired, without);
}
function rightPosition(tokens, left, race, retired, without, leftTokens) {
    if (tokens.includes("PA") || tokens.includes("IM"))
        return left === 2 ? 1 : 2;
    if (tokens.includes("RE")) {
        if (left !== 1)
            return 1;
        const entries = raceEntries(race);
        const positionSum = entries.reduce((sum, item) => sum + Number(item.position || 0), 0);
        if (positionSum === 21)
            return 2;
        const rest = minNormalPosition(leftTokens, race, retired, without);
        const excluded = excludedPositions(without, race);
        const tiedMode = mode(entries.map((item) => item.position));
        return rest !== "RET" && !excluded.includes(rest) && tiedMode === rest ? 1 : 2;
    }
    return minNormalPosition(tokens, race, retired, without);
}
function compareCode(left, right, lowerCode, equalCode, greaterCode) {
    if (left < right)
        return lowerCode;
    if (left === right)
        return equalCode;
    return greaterCode;
}
function firstNumber(value, fallback = 1) {
    const match = String(value !== null && value !== void 0 ? value : "").match(/\d+/);
    return match ? Number(match[0]) : fallback;
}
function secondNumber(value, fallback = 1) {
    var _a;
    const matches = (_a = String(value !== null && value !== void 0 ? value : "").match(/\d+/g)) !== null && _a !== void 0 ? _a : [];
    return matches.length > 1 ? Number(matches[1]) : fallback;
}
export function embeddedOdds(play) {
    const normalized = normalizePlay(play);
    const match = normalized.match(/10A\s*([0-9]+(?:[.,][0-9]+)?)/);
    if (match)
        return Number(match[1].replace(",", ".")) / 10;
    const numeric = normalized.match(/[+-]?\d+(?:[.,]\d+)?/);
    return numeric ? Number(numeric[0].replace(",", ".")) : 1;
}
export function winnerCode(bet, race) {
    var _a;
    const type = betTypeId(bet.play, bet.horse);
    const retired = ((_a = race.retired) !== null && _a !== void 0 ? _a : []).map(String).filter(Boolean);
    const without = parseHorseTokens(bet.without);
    const { left: leftTokens, right: rightTokens } = splitHorseSides(bet.horse);
    const min1 = leftPosition(leftTokens, race, retired, without);
    const min2 = rightPosition(rightTokens, min1, race, retired, without, leftTokens);
    if (min1 === "RET" || min2 === "RET")
        return type === 13 ? 1 : 4;
    switch (type) {
        case 1: return min1 <= firstNumber(bet.play) ? 1 : 5;
        case 2: return compareCode(min1, firstNumber(bet.play), 1, 2, 5);
        case 3: return compareCode(min1, secondNumber(bet.play), 1, 6, 5);
        case 4: return compareCode(min1, firstNumber(bet.play), 1, 4, 5);
        case 5: return min1 === 1 ? 1 : 5;
        case 6: return min1 <= 2 ? 1 : 5;
        case 7: {
            if (min1 !== 1)
                return 5;
            const entries = raceEntries(race);
            const rest = minNormalPosition(leftTokens, race, retired, without);
            const tiedMode = mode(entries.map((entry) => entry.position));
            return rest !== "RET" && !excludedPositions(without, race).includes(rest) && tiedMode === rest ? 4 : 3;
        }
        case 8: return compareCode(min1, min2, 1, 4, 5);
        case 9: return compareCode(min1, min2, 7, 4, 10);
        case 10: return compareCode(min1, min2, 8, 4, 10);
        case 11: return compareCode(min1, min2, 3, 4, 5);
        case 12: return compareCode(min1, min2, 9, 4, 10);
        case 13: return 2;
        case 14: return 3;
        case 15: return min1 <= 3 ? 1 : 5;
        default: throw new Error(`La jugada “${bet.play}” no está reconocida por el motor.`);
    }
}
export function factorForCode(code, play) {
    var _a;
    const factors = {
        1: 1, 2: 1 / 2, 3: embeddedOdds(play), 4: 0, 5: -1, 6: -1 / 2,
        7: 1 / 1.1, 8: 75 / 90,
        9: (() => { const odds = embeddedOdds(play); return odds < 0 ? -100 / odds : odds / 100; })(),
        10: -1
    };
    return (_a = factors[code]) !== null && _a !== void 0 ? _a : 0;
}
export function settlementCommission(race, fallback = 0.05) {
    const raceValue = Number(race === null || race === void 0 ? void 0 : race.commission);
    if (Number.isFinite(raceValue) && raceValue >= 0 && raceValue <= 1)
        return raceValue;
    const fallbackValue = Number(fallback);
    return Number.isFinite(fallbackValue) && fallbackValue >= 0 && fallbackValue <= 1 ? fallbackValue : 0.05;
}
export function settleBet(bet, race, commission = 0.05) {
    var _a, _b;
    const amount = parseAmount(bet.amount);
    if (amount <= 0)
        throw new Error("El monto debe ser mayor que cero.");
    if (!((_a = race.board) !== null && _a !== void 0 ? _a : []).some(Boolean))
        throw new Error("Debe registrar la pizarra antes de liquidar.");
    const effectiveCommission = settlementCommission(race, commission);
    const code = winnerCode(bet, race);
    const factor = factorForCode(code, bet.play);
    const playerCommission = code < 5 && bet.receiverId ? 1 - effectiveCommission : 1;
    const receiverMultipliers = [1, 1 - effectiveCommission, 1.025, 0.975];
    const receiverGroup = Math.max(1, Math.ceil(code / 3));
    const playerAmount = roundMoney(amount * playerCommission * factor);
    const receiverAmount = bet.receiverId ? roundMoney(-amount * ((_b = receiverMultipliers[receiverGroup - 1]) !== null && _b !== void 0 ? _b : 1) * factor) : 0;
    const commissionAmount = roundMoney(-(playerAmount + receiverAmount));
    return { code, factor, amount, playerAmount, receiverAmount, commissionAmount, settledAt: new Date().toISOString() };
}
export function calculateRaceSummary(race, participantsById) {
    var _a;
    const totals = new Map();
    const order = new Map();
    let sequence = 0;
    const add = (id, amount, rolePriority) => {
        var _a;
        if (!id || !amount)
            return;
        totals.set(id, roundMoney(((_a = totals.get(id)) !== null && _a !== void 0 ? _a : 0) + amount));
        const existing = order.get(id);
        if (!existing)
            order.set(id, { rolePriority, sequence: sequence++ });
        else if (rolePriority < existing.rolePriority)
            existing.rolePriority = rolePriority;
    };
    for (const bet of (_a = race.bets) !== null && _a !== void 0 ? _a : []) {
        if (bet.status !== "settled" || !bet.settlement)
            continue;
        add(bet.playerId, bet.settlement.playerAmount, 0);
        add(bet.receiverId, bet.settlement.receiverAmount, 1);
    }
    return [...totals.entries()].map(([participantId, amount]) => {
        var _a, _b, _c, _d;
        return (Object.assign({ participantId, name: (_d = (_b = (_a = participantsById.get(participantId)) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : (_c = participantsById.get(participantId)) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : "Sin nombre", amount }, order.get(participantId)));
    }).sort((a, b) => a.rolePriority - b.rolePriority || a.sequence - b.sequence)
        .map((_a) => {
        var { rolePriority, sequence } = _a, item = __rest(_a, ["rolePriority", "sequence"]);
        return item;
    });
}
export function parseQuickBet(input, participants) {
    var _a;
    const tokens = String(input !== null && input !== void 0 ? input : "").trim().split(/\s+/);
    if (tokens.length < 4)
        throw new Error("Formato rápido: JUGADA CABALLO MONTO JUEGA [CONSIGUE] [SIN=1,2]");
    const [play, horse, amountToken, playerCode, receiverCode, ...rest] = tokens;
    const find = (code) => participants.find((p) => p.code.toLowerCase() === String(code).toLowerCase());
    const player = find(playerCode);
    const receiver = receiverCode && !receiverCode.startsWith("SIN=") ? find(receiverCode) : null;
    if (!player)
        throw new Error(`No existe el participante “${playerCode}”.`);
    if (receiverCode && !receiverCode.startsWith("SIN=") && !receiver)
        throw new Error(`No existe el participante “${receiverCode}”.`);
    const withoutToken = [receiverCode, ...rest].find((token) => token === null || token === void 0 ? void 0 : token.toUpperCase().startsWith("SIN="));
    return { play: normalizePlay(play), horse: horse.replace(/x/gi, "*"), amount: parseAmount(amountToken), playerId: player.id, receiverId: (_a = receiver === null || receiver === void 0 ? void 0 : receiver.id) !== null && _a !== void 0 ? _a : "", without: withoutToken ? withoutToken.slice(4) : "" };
}
export function riskAmountForBet(bet, role = "player") {
    const amount = parseAmount(bet.amount);
    const type = betTypeId(bet.play, bet.horse);
    return role === "receiver" && [7, 11].includes(type) ? roundMoney(amount * Math.abs(embeddedOdds(bet.play))) : amount;
}
export function calculateRiskMatrix(race, participants = [], balances = new Map()) {
    var _a;
    const valid = (race.bets || []).filter((bet) => bet.status !== "cancelled");
    const rows = [];
    for (const participant of participants) {
        const exposures = new Map();
        const relevant = valid.flatMap((bet) => {
            const result = [];
            if (bet.playerId === participant.id)
                result.push({ bet, role: "player", value: riskAmountForBet(bet, "player") });
            if (bet.receiverId === participant.id)
                result.push({ bet, role: "receiver", value: riskAmountForBet(bet, "receiver") });
            return result;
        });
        for (const item of relevant) {
            const key = String(item.bet.horse || "-").replace(/\*/g, "x");
            const current = exposures.get(key) || { selection: key, player: 0, receiver: 0, count: 0 };
            current[item.role] += item.value;
            current.count += 1;
            exposures.set(key, current);
        }
        let singles = 0;
        let groupedPlayer = 0;
        let groupedReceiver = 0;
        for (const exposure of exposures.values()) {
            if (exposure.count === 1)
                singles += exposure.player + exposure.receiver;
            else {
                groupedPlayer += exposure.player;
                groupedReceiver += exposure.receiver;
            }
        }
        const totalRisk = roundMoney(singles + Math.abs(groupedPlayer - groupedReceiver));
        const aval = roundMoney(Number(participant.avalBs || 0) + Number(participant.avalUsd || 0) * Number(race.exchangeRate || 0));
        const available = roundMoney(((_a = balances.get(participant.id)) !== null && _a !== void 0 ? _a : Number(participant.openingBalance || 0)) + aval);
        const free = participant.pooled === false && aval === 0;
        rows.push({ participant, exposures: [...exposures.values()], totalRisk, available, remaining: free ? Infinity : roundMoney(available - totalRisk), free });
    }
    return rows;
}
export function calculateJugarDisponible(currentAmount, playerRemaining, receiverRemaining) {
    const amount = parseAmount(currentAmount);
    const d1 = Number(playerRemaining);
    const d2 = Number(receiverRemaining);
    if (d1 >= 0 && d2 >= 0)
        return { amount, changed: false, message: "Ambos tercios tienen disponible" };
    const correction = Math.min(Number.isFinite(d1) ? d1 : 0, Number.isFinite(d2) ? d2 : 0);
    return { amount: Math.max(0, roundMoney(amount + correction)), changed: true, correction };
}
export function scorePollaEntry(picks = [], validResults = []) {
    return picks.slice(0, 6).reduce((score, horse, index) => {
        const result = validResults[index] || {};
        const value = String(horse || "").trim();
        if (!value)
            return score;
        if ((result.first || []).map(String).includes(value))
            return score + 5;
        if ((result.second || []).map(String).includes(value))
            return score + 3;
        if ((result.third || []).map(String).includes(value))
            return score + 1;
        return score;
    }, 0);
}
export function calculatePolla(polla) {
    var _a;
    const entries = (polla.entries || []).map((entry) => (Object.assign(Object.assign({}, entry), { score: scorePollaEntry(entry.picks, polla.validResults) })));
    const maxScore = entries.length ? Math.max(...entries.map((entry) => entry.score)) : 0;
    const winners = entries.filter((entry) => entry.score === maxScore && maxScore > 0);
    const totalPlayed = roundMoney(entries.length * Number(polla.ticketValue || 0));
    const bettorsPool = roundMoney(totalPlayed * Number((_a = polla.bettorsPercent) !== null && _a !== void 0 ? _a : 0.8));
    const adminShare = roundMoney(totalPlayed - bettorsPool);
    const payoutPerWinner = winners.length ? roundMoney(bettorsPool / winners.length) : 0;
    return { entries, maxScore, winners, totalPlayed, bettorsPool, adminShare, payoutPerWinner };
}