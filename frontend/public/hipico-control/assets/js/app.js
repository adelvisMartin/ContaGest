import { BET_OPTIONS, calculateJugarDisponible, calculatePolla, calculateRaceSummary, calculateRiskMatrix, parseAmount, parseQuickBet, roundMoney, settleBet } from "./engine.js";
import { csvEscape, generateBalancesWhatsappText, generateBetReceiptText, generateDailySummaryText, generateWhatsappText, money, number, shortDate } from "./format.js";
import { createBlankWorkspace } from "./seed.js";
import { backupFilename, deliverJsonBackup, serializeWorkspaceBackup } from "./backup.js";
import { clearLocalWorkspace, createSnapshot, downloadFile, enqueueOutbox, flushWorkspaceWrites, getAppMode, initializeStorage, listOutbox, listSnapshots, loadLocalWorkspace, queueWorkspaceSave, removeOutbox, requestPersistentStorage, restoreSnapshot, saveLocalWorkspace, setAppMode, storageDiagnostics } from "./store.js";
import { downloadPdf, downloadXlsx, fixedWidthTable } from "./reports.js";
import { mergeWorkspaces, shouldMergeCloud } from "./sync.js";
import { appendCloudAudit, currentSession, currentUserSummary, fetchCloudAccess, fetchCloudProfile, fetchCloudWorkspace, fetchRecentShadowEvaluations, initializeCloudSession, isTransientCloudError, isVersionConflict, saveCloudWorkspace, signIn, signOut, signUp } from "./supabase.js";
import { APP_VERSION, CLOUD_CONFIG } from "./config.js";
import { escapeHtml, icon, toast } from "./ui.js";
import { createId as uid, isoNow as now, normalizeWorkspaceShape, rateForDate, todayIso as today } from "./workspace.js";
import { generateClosureText, parseWhatsAppChat, participantMatchesSender, senderCode } from "./whatsapp.js";
import { clearLocalAdminEnrollment, enrollLocalAdmin, hasLocalAdminEnrollment, verifyLocalAdmin } from "./local-auth.js";
const root = document.querySelector("#app");
let mode = null;
let workspace = null;
let view = new URLSearchParams(location.search).get("view") || "dashboard";
let raceTab = new URLSearchParams(location.search).get("tab") || "capture";
let reportTab = "daily";
let modal = null;
let cloudWorkspaceId = null;
let cloudProfile = null;
let syncTimer = null;
let installPrompt = null;
let isSyncing = false;
let focusSelector = null;
let historyFilter = { from: "", to: "", track: "", participant: "", type: "", status: "" };
let storageInfo = { engine: "IndexedDB", persisted: false, usage: 0, quota: 0, outbox: 0, snapshots: 0 };
let navigationHistory = [];
let calendarPicker = null;
let lastScrollY = 0;
let chatDraft = "";
let chatAnalysis = null;
let chatApprovedMatchIds = new Set();
let backupJsonText = "";
let backupJsonFilename = "";
let shadowFeed = { status: "idle", items: [], error: "", updatedAt: null };
let shadowRefreshTimer = null;
function groupList() { return workspace?.config?.groups || workspace?.config?.whatsappGroups || []; }
function activeGroupId() { return workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || groupList()[0]?.id || "group-1"; }
function activeGroup() { return groupList().find((group) => group.id === activeGroupId()) || groupList()[0] || { id: "group-1", name: "Triple Crown", companyName: workspace?.config?.clubName || "CLUB HIPICO TRIPLE CROWN", color: "#7ea596", currency: workspace?.config?.currency || "Bs.", exchangeRate: workspace?.config?.exchangeRate || 160, commission: workspace?.config?.commission || .05, showConversion: true, autoRate: true, footerMessage: workspace?.config?.footerMessage || "" }; }
function groupItems(items, groupId = activeGroupId()) { return (items || []).filter((item) => !item.groupId || item.groupId === groupId); }
function groupParticipants() { return groupItems(workspace?.participants).filter((participant) => participant.active !== false); }
function activeCurrency() { return activeGroup().currency || "Bs."; }
function activeCompany() { return activeGroup().companyName || activeGroup().name || "Control Hípico"; }
function activeFooter() { return activeGroup().footerMessage || workspace.config.footerMessage || ""; }

function selectedCaptureGroupIds() {
    const valid = new Set(groupList().filter((group) => group.active !== false).map((group) => group.id));
    const configured = Array.isArray(workspace?.config?.captureGroupIds) ? workspace.config.captureGroupIds.filter((id) => valid.has(id)) : [];
    const ids = configured.length ? configured : [activeGroupId()];
    if (!ids.includes(activeGroupId())) ids.unshift(activeGroupId());
    return [...new Set(ids)];
}
function selectedCaptureGroups() { return selectedCaptureGroupIds().map((id) => groupList().find((group) => group.id === id)).filter(Boolean); }
function scrollContainer() { return document.scrollingElement || document.documentElement; }
function scrollTopValue() { return Number(window.scrollY || scrollContainer()?.scrollTop || 0); }
function restoreScroll(value) {
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, Number(value) || 0)));
}
function scrollPageTop() { requestAnimationFrame(() => window.scrollTo(0, 0)); }
function brandMarkup(size = "normal") {
    const wordmark = size === "wordmark";
    const source = wordmark ? "./logo-control-hipico.png" : "./icons/icon-192.png";
    return `<img class="brand-logo brand-logo--${size}" src="${source}" alt="Control Hípico">`;
}
function allGroupMetrics() {
    const result = groupList().filter((group) => group.active !== false).map((group) => {
        const days = groupItems(workspace.days, group.id); const day = [...days].reverse().find((item) => item.status === "open") || days.at(-1);
        const races = groupItems(workspace.races, group.id).filter((race) => !day || race.dayId === day.id);
        const bets = races.flatMap((race) => race.bets || []).filter((bet) => bet.status !== "cancelled");
        const settled = bets.filter((bet) => bet.status === "settled" && bet.settlement);
        const pending = bets.filter((bet) => bet.status === "pending");
        const volume = bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
        const commission = settled.reduce((sum, bet) => sum + Number(bet.settlement?.commissionAmount || 0), 0);
        const recent = bets.filter((bet) => Date.now() - new Date(bet.createdAt || 0).getTime() <= 3600000).length;
        return { group, day, races, bets, settled, pending, volume, commission, recent };
    });
    return {
        groups: result,
        activeGroups: result.length,
        races: result.reduce((sum, item) => sum + item.races.length, 0),
        bets: result.reduce((sum, item) => sum + item.bets.length, 0),
        pending: result.reduce((sum, item) => sum + item.pending.length, 0),
        commission: result.reduce((sum, item) => sum + item.commission, 0),
        recent: result.reduce((sum, item) => sum + item.recent, 0)
    };
}
function riskText(race) {
    const rows = riskRows(race).filter((item) => item.exposures.length);
    const lines = [`🏇 ${activeCompany()} · MATRIZ DE RIESGO`, `${race.racetrack} · ${race.number}ª · ${shortDate(race.date)}`, "", "TERCIO\tRIESGO\tDISPONIBLE\tRESTANTE"];
    for (const row of rows) lines.push(`${row.participant.code.toUpperCase()}\t${number(row.totalRisk)}\t${row.free ? "LIBRE" : number(row.available)}\t${row.free ? "LIBRE" : number(row.remaining)}`);
    if (rows.length) {
        lines.push("", "DETALLE POR SELECCIÓN");
        for (const row of rows) for (const exposure of row.exposures) lines.push(`${row.participant.code.toUpperCase()} · ${exposure.selection}: J ${number(exposure.player)} / C ${number(exposure.receiver)}`);
    }
    return lines.join("\n");
}
function metricsText() {
    const metrics = allGroupMetrics();
    const lines = ["🏇 HÍPICO CONTROL · MÉTRICAS MULTIGRUPO", `Actualizado: ${new Date().toLocaleString("es-VE")}`, "", `Grupos activos: ${metrics.activeGroups}`, `Carreras: ${metrics.races}`, `Apuestas: ${metrics.bets}`, `Pendientes: ${metrics.pending}`, `Apuestas última hora: ${metrics.recent}`, ""];
    for (const item of metrics.groups) lines.push(`${item.group.name}: ${item.races.length} carreras · ${item.bets.length} apuestas · ${item.pending.length} pendientes · volumen ${number(item.volume)} ${item.group.currency}`);
    return lines.join("\n");
}

function setActiveRaceId(id) { workspace.config.activeRaceByGroup ||= {}; workspace.config.activeRaceByGroup[activeGroupId()] = id || null; workspace.activeRaceId = id || null; }
function groupColorStyle(group = activeGroup()) { return `--group-accent:${group.color || "#7ea596"}`; }
function applyVisualPreferences() {
    const theme = workspace?.config?.theme || "system";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--active-group", activeGroup().color || "#667c70");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111315" : "#7a101d");
}
function navigateTo(target, options = {}) {
    if (!target || target === view) return;
    if (!options.replace) navigationHistory.push(view);
    view = target;
    if (view === "race") raceTab = options.keepTab ? raceTab : "capture";
    const state = { hipico: true, view };
    try { options.replace ? history.replaceState(state, "") : history.pushState(state, ""); } catch (_) {}
    render();
    scrollPageTop();
}
function goBack() {
    if (calendarPicker) { calendarPicker = null; document.querySelector("[data-calendar-overlay]")?.remove(); return; }
    if (modal) { modal = null; render(); return; }
    const target = navigationHistory.pop() || "dashboard";
    view = target;
    try { history.replaceState({ hipico: true, view }, ""); } catch (_) {}
    render();
    scrollPageTop();
}
function groupSwitcherMarkup(compact = false) {
    const groups = groupList().filter((group) => group.active !== false);
    return `<div class="group-switcher ${compact ? "is-compact" : ""}" role="group" aria-label="Cambiar grupo">${groups.map((group) => `<button type="button" class="group-pill ${group.id === activeGroupId() ? "is-active" : ""}" style="${groupColorStyle(group)}" data-action="select-group" data-id="${group.id}"><i></i><span>${escapeHtml(group.name)}</span>${compact ? "" : `<small>${escapeHtml(group.companyName)}</small>`}</button>`).join("")}</div>`;
}
function participantOptions(selected = "") { return groupParticipants().map((p) => `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${escapeHtml(p.code.toUpperCase())} · ${escapeHtml(p.name)}</option>`).join(""); }
function dateLabel(value) { try { return new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); } catch (_) { return value; } }
function dateField(name, value, label = "Fecha") { return `<div class="field"><label>${escapeHtml(label)}</label><input type="hidden" name="${name}" value="${value}" data-date-value="${name}"><button type="button" class="date-button" data-action="open-date-picker" data-field="${name}">${icon("report")}<span data-date-label="${name}">${escapeHtml(dateLabel(value))}</span><small>Cambiar</small></button></div>`; }
function renderCalendarOverlay() {
    if (!calendarPicker) return "";
    const selected = new Date(`${calendarPicker.value || today()}T12:00:00`);
    const cursor = new Date(calendarPicker.cursor || selected); cursor.setDate(1);
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = (cursor.getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: first }, () => "<span></span>").concat(Array.from({ length: days }, (_, i) => {
        const day = i + 1; const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const cls = iso === calendarPicker.value ? "is-selected" : iso === today() ? "is-today" : "";
        return `<button type="button" class="calendar-day ${cls}" data-action="select-date" data-value="${iso}">${day}</button>`;
    }));
    const monthName = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric" }).format(cursor);
    return `<div class="calendar-overlay" data-calendar-overlay><section class="calendar-card" role="dialog" aria-modal="true"><header><button type="button" class="icon-button" data-action="calendar-prev">${icon("back")}</button><div><strong>${escapeHtml(monthName)}</strong><small>Selecciona una fecha</small></div><button type="button" class="icon-button" data-action="calendar-next" style="transform:rotate(180deg)">${icon("back")}</button></header><div class="calendar-week"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="calendar-grid">${cells.join("")}</div><footer><button type="button" class="button" data-action="calendar-today">Hoy</button><button type="button" class="button button--ghost" data-action="close-calendar">Cancelar</button></footer></section></div>`;
}
function showParticipantSuggestions(input) {
    const field = input.closest(".field"); const menu = field?.querySelector("[data-suggestion-menu]"); if (!menu) return;
    const query = String(input.value || "").trim().toLowerCase();
    const matches = groupParticipants().filter((p) => !query || p.code.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)).slice(0, 6);
    menu.innerHTML = matches.map((p) => `<button type="button" data-action="choose-participant" data-field="${input.name}" data-value="${escapeHtml(p.code)}"><strong>${escapeHtml(p.code.toUpperCase())}</strong><span>${escapeHtml(p.name)}</span></button>`).join("");
    menu.classList.toggle("is-open", matches.length > 0 && document.activeElement === input);
}
function participantInput(name, label, value = "", required = false, placeholder = "Código o nombre") { return `<div class="field participant-field"><label>${escapeHtml(label)}</label><input class="input" name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" data-participant-input ${required ? "required" : ""}><div class="suggestion-menu" data-suggestion-menu></div></div>`; }

function workspaceRateForDate(date, source = workspace) {
    const groupId = source?.config?.activeGroupId || activeGroupId();
    const group = source?.config?.groups?.find((item) => item.id === groupId) || activeGroup();
    const rates = groupItems(source?.exchangeRates || [], groupId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const match = rates.filter((rate) => rate.date <= date).at(-1);
    return Number(match?.rate || group.exchangeRate || source?.config?.exchangeRate || 1);
}
function activeDay() { const days = groupItems(workspace.days); return days.find((d) => d.status === "open") || days.at(-1); }
function activeRace() { const races = groupItems(workspace.races); const id = workspace.config.activeRaceByGroup?.[activeGroupId()] || workspace.activeRaceId; return races.find((r) => r.id === id) || races.at(-1) || null; }
function pMap() { return new Map(groupItems(workspace.participants).map((p) => [p.id, p])); }
function pCode(id) { var _a; return ((_a = pMap().get(id)) === null || _a === void 0 ? void 0 : _a.code) || ""; }
function participantByCode(code, required = false) {
    const value = String(code || "").trim().toLowerCase();
    const p = groupParticipants().find((x) => x.code.toLowerCase() === value || x.name.toLowerCase() === value);
    if (!p && required) throw new Error(`No existe el participante “${code}” en ${activeGroup().name}.`);
    return p || null;
}
function toBs(amount, currency, date) { return currency === "USD" ? roundMoney(Number(amount) * workspaceRateForDate(date)) : Number(amount); }
function toUsd(amount, date) { const rate = workspaceRateForDate(date); return rate ? roundMoney(Number(amount) / rate) : 0; }
function balanceAt(participantId, until = "9999-12-31") {
    const participant = workspace.participants.find((p) => p.id === participantId); if (!participant) return 0;
    const groupId = participant.groupId || "group-1"; let total = Number(participant.openingBalance || 0);
    for (const race of groupItems(workspace.races, groupId)) {
        if (race.date > until) continue;
        for (const bet of race.bets || []) {
            if (bet.status !== "settled" || !bet.settlement) continue;
            if (bet.playerId === participantId) total += Number(bet.settlement.playerAmount || 0);
            if (bet.receiverId === participantId) total += Number(bet.settlement.receiverAmount || 0);
        }
    }
    for (const mov of groupItems(workspace.movements, groupId)) {
        if (mov.status === "cancelled" || (mov.date || "") > until) continue;
        const amount = toBs(Math.abs(Number(mov.amount || 0)), mov.currency || "VES", mov.date || today());
        if (mov.type === "transfer") { if (mov.participantId === participantId) total -= amount; if (mov.counterpartyId === participantId) total += amount; }
        else if (mov.participantId === participantId) total += Number(mov.amount) < 0 ? -amount : amount;
    }
    return roundMoney(total);
}
function currentBalanceRows() { return groupItems(workspace.participants).map((participant) => ({ participant, balance: balanceAt(participant.id) })); }
function participantAvailable(p, race = activeRace()) {
    const rate = Number((race === null || race === void 0 ? void 0 : race.exchangeRate) || workspaceRateForDate((race === null || race === void 0 ? void 0 : race.date) || today()));
    return roundMoney(balanceAt(p.id) + Number(p.avalBs || 0) + Number(p.avalUsd || 0) * rate);
}
function dayStats(day = activeDay()) {
    const races = groupItems(workspace.races).filter((r) => r.dayId === day?.id); const bets = races.flatMap((r) => r.bets || []); const valid = bets.filter((b) => b.status !== "cancelled"); const settled = valid.filter((b) => b.status === "settled" && b.settlement); const pending = valid.filter((b) => b.status === "pending");
    return { races: races.length, bets: valid.length, volume: valid.reduce((s, b) => s + Number(b.amount || 0), 0), settled: settled.length, pending: pending.length, cancelled: bets.filter((b) => b.status === "cancelled").length, commission: roundMoney(settled.reduce((s, b) => s + Number(b.settlement.commissionAmount || 0), 0)), controlDifference: roundMoney(settled.reduce((s, b) => s + Number(b.settlement.playerAmount || 0) + Number(b.settlement.receiverAmount || 0) + Number(b.settlement.commissionAmount || 0), 0)), openRaces: races.filter((r) => r.status !== "closed"), racesList: races };
}
function addAudit(action, entityType, entityId, message, payload = {}) {
    const event = { id: uid("audit"), groupId: activeGroupId(), action, entityType, entityId, message, payload, createdAt: now() };
    workspace.audit.unshift(event); workspace.audit = workspace.audit.slice(0, 1000); return event;
}
function persist(event = null, options = {}) {
    workspace.version = Number(workspace.version || 0) + 1;
    workspace.updatedAt = now();
    if (event && mode === "cloud") {
        workspace.syncQueue.push(event);
        enqueueOutbox(event).then(refreshStorageInfo).catch((error) => toast(`No se pudo preparar la sincronización: ${error.message}`, "error"));
    }
    queueWorkspaceSave(workspace, options).then(refreshStorageInfo).catch((error) => toast(`Error al guardar en IndexedDB: ${error.message}`, "error"));
    if (mode === "cloud" && navigator.onLine && currentSession())
        scheduleCloudSync();
}
function mutate(action, entityType, entityId, message, fn, payload = {}) {
    fn();
    const event = addAudit(action, entityType, entityId, message, payload);
    persist(event);
    render();
}
async function refreshStorageInfo() {
    try {
        storageInfo = await storageDiagnostics();
        renderStatus();
    }
    catch ( /* diagnóstico no bloqueante */_a) { /* diagnóstico no bloqueante */ }
}
async function saveCloudWorkspaceSafely() {
    var _a;
    let remote = await fetchCloudWorkspace();
    let expectedVersion = Number((remote === null || remote === void 0 ? void 0 : remote.version) || ((_a = workspace.syncMeta) === null || _a === void 0 ? void 0 : _a.lastSyncedVersion) || 0);
    if ((remote === null || remote === void 0 ? void 0 : remote.state) && shouldMergeCloud(workspace, remote)) {
        await createSnapshot(workspace, "antes-de-fusion-nube");
        workspace = normalizeWorkspaceShape(mergeWorkspaces(workspace, remote.state));
        workspace.syncMeta.conflictSnapshots = Number(workspace.syncMeta.conflictSnapshots || 0) + 1;
        cloudWorkspaceId = remote.id;
    }
    try {
        return await saveCloudWorkspace(workspace, cloudWorkspaceId, expectedVersion);
    }
    catch (error) {
        if (!isVersionConflict(error))
            throw error;
        remote = await fetchCloudWorkspace();
        if (!(remote === null || remote === void 0 ? void 0 : remote.state))
            throw error;
        await createSnapshot(workspace, "conflicto-nube-reintento");
        workspace = normalizeWorkspaceShape(mergeWorkspaces(workspace, remote.state));
        workspace.syncMeta.conflictSnapshots = Number(workspace.syncMeta.conflictSnapshots || 0) + 1;
        cloudWorkspaceId = remote.id;
        return saveCloudWorkspace(workspace, cloudWorkspaceId, Number(remote.version || 0));
    }
}
function scheduleCloudSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        if (!navigator.onLine || !currentSession() || !workspace || isSyncing)
            return;
        try {
            isSyncing = true;
            renderStatus();
            const row = await saveCloudWorkspaceSafely();
            cloudWorkspaceId = (row === null || row === void 0 ? void 0 : row.id) || cloudWorkspaceId;
            for (const event of await listOutbox()) {
                await appendCloudAudit(event, cloudWorkspaceId);
                await removeOutbox(event.id);
            }
            workspace.syncQueue = [];
            workspace.syncMeta.lastSyncedVersion = Number((row === null || row === void 0 ? void 0 : row.version) || workspace.syncMeta.lastSyncedVersion || 0);
            workspace.syncMeta.lastSyncedAt = now();
            await saveLocalWorkspace(workspace);
            isSyncing = false;
            await refreshStorageInfo();
            render();
        }
        catch (error) {
            isSyncing = false;
            await refreshStorageInfo();
            toast(`Pendiente de sincronizar: ${error.message}`, "error");
        }
    }, 450);
}
function withStartupTimeout(promise, milliseconds, message) {
    let timer = null;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
}
async function init() {
    var _a, _b, _c, _d;
    (_a = globalThis.__HIPICO_SET_BOOT_STATUS__) === null || _a === void 0 ? void 0 : _a.call(globalThis, "Abriendo almacenamiento local…");
    await withStartupTimeout(initializeStorage(createBlankWorkspace), 8000, "El almacenamiento del dispositivo no respondió. Abre Recuperación segura.");
    (_b = globalThis.__HIPICO_SET_BOOT_STATUS__) === null || _b === void 0 ? void 0 : _b.call(globalThis, "Comprobando sesión…");
    try {
        await withStartupTimeout(initializeCloudSession(), 5000, "La sesión de nube tardó demasiado.");
    }
    catch (error) {
        console.warn("Inicio del dispositivo:", error);
    }
    (_c = globalThis.__HIPICO_SET_BOOT_STATUS__) === null || _c === void 0 ? void 0 : _c.call(globalThis, "Recuperando configuración…");
    mode = await getAppMode();
    if (mode === "cloud" && currentSession()) {
        workspace = normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
        (_d = globalThis.__HIPICO_SET_BOOT_STATUS__) === null || _d === void 0 ? void 0 : _d.call(globalThis, "Preparando interfaz…");
        await refreshStorageInfo();
        render();
        if (navigator.onLine) {
            try {
                cloudProfile = await fetchCloudProfile();
                const row = await fetchCloudWorkspace();
                if (row === null || row === void 0 ? void 0 : row.state) {
                    workspace = normalizeWorkspaceShape(mergeWorkspaces(workspace, row.state));
                    cloudWorkspaceId = row.id;
                    workspace.syncMeta.lastSyncedVersion = Number(row.version || 0);
                    workspace.syncMeta.lastSyncedAt = now();
                    await saveLocalWorkspace(workspace);
                }
                render();
            }
            catch (error) {
                toast(`Continuidad sin conexión activa: ${error.message}`, "error");
            }
        }
        return;
    }
    if (mode === "local") {
        cloudProfile = null;
        workspace = normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
    }
    (_d = globalThis.__HIPICO_SET_BOOT_STATUS__) === null || _d === void 0 ? void 0 : _d.call(globalThis, "Preparando interfaz…");
    await refreshStorageInfo();
    render();
}
async function copyText(text, message = "Texto copiado.") {
    var _a;
    if ((_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.writeText)
        await navigator.clipboard.writeText(text);
    else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand("copy");
        area.remove();
        if (!copied)
            throw new Error("No se pudo copiar automáticamente.");
    }
    toast(message, "success");
}
async function openWhatsApp(text) {
    if (!navigator.onLine) {
        await copyText(text, "Sin internet: mensaje copiado para enviarlo cuando recuperes conexión.");
        return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}
async function shareText(title, text) { if (navigator.share)
    await navigator.share({ title, text });
else
    await copyText(text); }
async function prepareJsonBackup() {
    await flushWorkspaceWrites();
    backupJsonFilename = backupFilename(today());
    backupJsonText = serializeWorkspaceBackup(workspace);
    return { filename: backupJsonFilename, jsonText: backupJsonText };
}
async function exportJsonBackup() {
    const backup = await prepareJsonBackup();
    const result = await deliverJsonBackup(backup.filename, backup.jsonText);
    if (result.ok) {
        const message = result.method === "share" ? "Respaldo listo para guardar o compartir." : "Respaldo JSON guardado.";
        toast(message, "success", { duration: 5000 });
        return;
    }
    if (result.method === "cancelled") return;
    await copyText(backup.jsonText, "Respaldo copiado. Guárdalo en Notas, Drive o WhatsApp.");
    modal = { type: "backup-json" };
    render();
}
function queueFocus(selector) { focusSelector = selector; }
function applyFocus() { if (!focusSelector)
    return; const selector = focusSelector; focusSelector = null; requestAnimationFrame(() => { var _a; return (_a = root.querySelector(selector)) === null || _a === void 0 ? void 0 : _a.focus(); }); }
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; render(); });
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register(new URL("./sw.js", window.location.href).pathname);
            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                worker === null || worker === void 0 ? void 0 : worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" && navigator.serviceWorker.controller) {
                        toast("Hay una actualización lista. Se aplicará al volver a abrir la app.", "info");
                    }
                });
            });
        }
        catch (_a) {
            // La aplicación continúa operativa aunque el navegador rechace el service worker.
        }
    });
}
window.addEventListener("online", () => { renderStatus(); if (mode === "cloud")
    scheduleCloudSync(); toast("Conexión recuperada. Sincronizando cambios.", "success"); });
window.addEventListener("offline", () => { renderStatus(); toast("Sin internet: puedes seguir trabajando. Los cambios quedan protegidos en este dispositivo.", "info"); });
window.addEventListener("beforeunload", (event) => {
    if (!workspace)
        return;
    flushWorkspaceWrites().catch(() => { });
});
function renderAuth() {
    root.innerHTML = `<main class="auth-screen"><section class="auth-card soft-auth"><div class="auth-hero"><div class="auth-wordmark">${brandMarkup("wordmark")}</div><div class="auth-copy"><h1>Control hípico rápido, auditable y disponible sin conexión.</h1><p>Registra apuestas en segundos, trabaja sin internet, administra grupos independientes y sincroniza cuando recuperes conexión.</p></div><div class="auth-points"><div class="auth-point">${icon("check")} Continuidad sin conexión y recuperación automática</div><div class="auth-point">${icon("race")} Reglas operativas reconstruidas del Excel</div><div class="auth-point">${icon("group")} Varios grupos con datos separados</div></div></div><div class="auth-panel"><div class="auth-lock">${icon("users")}</div><h2>Acceso administrador</h2><p>Usa tus credenciales para sincronizar o continuar trabajando cuando no haya conexión.</p><form id="auth-form" class="form"><div class="field"><label>Correo</label><input class="input" name="email" type="email" autocomplete="username" required></div><div class="field"><label>Contraseña</label><input class="input" name="password" type="password" minlength="10" autocomplete="current-password" required></div><button class="button button--primary button--xl" name="authAction" value="signin">Entrar y sincronizar</button><button class="button button--xl" name="authAction" value="local">Entrar sin conexión</button></form><div class="auth-offline-note"><strong>Acceso personal protegido</strong><span>Los datos operativos permanecen disponibles en este dispositivo y se sincronizan cuando vuelve la conexión.</span></div></div></section></main>`;
    globalThis.__HIPICO_MARK_BOOT_OK__?.();
}
function nav(target, label, iconName) { return `<button class="nav-button ${view === target ? "is-active" : ""}" data-view="${target}">${icon(iconName)}<span>${label}</span></button>`; }
function mnav(target, label, iconName, activeWhen = [target]) { return `<button class="${activeWhen.includes(view) ? "is-active" : ""}" data-view="${target}">${icon(iconName)}<span>${label}</span></button>`; }
function pageTitle() { return ({ dashboard: "Resumen", race: "Carrera activa", whatsapp: "Chat WhatsApp", advanced: "Adelantadas", participants: activeGroup().clientLabel || "Participantes", history: "Historial de jugadas", reports: "Cierres y saldos", polla: "POLLA", settings: "Configuración" })[view] || "Control Hípico"; }
function syncMarkup() { var _a; const offline = !navigator.onLine; const pending = storageInfo.outbox || ((_a = workspace === null || workspace === void 0 ? void 0 : workspace.syncQueue) === null || _a === void 0 ? void 0 : _a.length) || 0; return `<div class="sync-state ${mode === "cloud" && !offline ? "is-cloud" : offline ? "is-offline" : ""}"><span class="dot"></span>${offline ? `Sin conexión · ${pending} pendientes` : isSyncing ? "Sincronizando…" : mode === "cloud" ? "IndexedDB + nube" : "Solo dispositivo"}</div>`; }
function renderStatus() { document.querySelectorAll("[data-sync-state]").forEach((node) => node.innerHTML = syncMarkup()); }
function cloudUser() { return currentUserSummary(cloudProfile); }
function userBadgeMarkup(compact = false) {
    if (mode !== "cloud" || !currentSession())
        return compact ? "" : `<div class="user-chip"><strong>Continuidad sin conexión</strong><small>Solo este dispositivo</small></div>`;
    const user = cloudUser();
    return `<div class="user-chip ${user.isAdmin ? "is-admin" : ""}"><strong>${escapeHtml(user.displayName)}</strong><small>${user.isAdmin ? "Administrador" : "Operador"} · ${escapeHtml(user.email)}</small></div>`;
}
function render() {
    if (!mode || !workspace) {
        syncShadowFeedPolling();
        return renderAuth();
    }
    applyVisualPreferences(); const race = activeRace(); const isMore = ["history", "reports", "polla", "settings"].includes(view);
    root.innerHTML = `<div class="shell app-soft" style="${groupColorStyle()}"><aside class="sidebar"><button class="brand brand-button" data-action="go-home">${brandMarkup("auth")}<div><strong>Hípico Control</strong><small>v${APP_VERSION} · Adelvis Martin</small></div></button>${groupSwitcherMarkup()}<nav class="nav">${nav("dashboard", "Resumen", "dashboard")}${nav("race", "Captura", "race")}${nav("whatsapp", "Chat WhatsApp", "chat")}${nav("advanced", "Adelantadas", "plus")}${nav("participants", activeGroup().clientLabel || "Participantes", "users")}${nav("history", "Historial", "report")}${nav("reports", "Cierres y saldos", "report")}${nav("polla", "POLLA", "check")}${nav("settings", "Configuración", "settings")}</nav><div class="sidebar-footer">${userBadgeMarkup()}<div data-sync-state>${syncMarkup()}</div><button class="button button--danger button--small" data-action="logout">${icon("logout")} Cerrar sesión</button></div></aside><main class="main"><header class="mobile-header"><button class="mobile-back ${view === "dashboard" ? "is-hidden" : ""}" data-action="go-back" aria-label="Volver">${icon("back")}</button><button class="brand mobile-brand" data-action="go-home">${brandMarkup("auth")}<div><strong>${pageTitle()}</strong><small><i class="group-dot" style="background:${activeGroup().color}"></i>${escapeHtml(activeGroup().name)} · ${escapeHtml(race?.racetrack || "Sin carrera")}</small></div></button><div class="mobile-header-actions"><button class="icon-button" data-action="toggle-theme" aria-label="Cambiar tema">${icon(workspace.config.theme === "dark" ? "sun" : "moon")}</button><button class="button icon-button button--primary" data-action="focus-fast">${icon("plus")}</button></div></header><header class="topbar"><div><h1>${pageTitle()}</h1><div class="context">${activeDay() ? `${shortDate(activeDay().date)} · ${navigator.onLine ? "en línea" : "sin conexión"}` : "Sin jornada"}</div></div><div class="top-actions">${groupSwitcherMarkup(true)}${mode === "cloud" ? `<span class="badge badge--success">${cloudUser().isAdmin ? "Admin" : "Operador"}</span>` : ""}<div data-sync-state>${syncMarkup()}</div><button class="button button--primary" data-action="focus-fast">${icon("plus")} Captura rápida</button></div></header><div class="content">${installPrompt ? `<div class="install-banner"><p><strong>Instalar en el teléfono:</strong> funcionará como app y mantendrá tus datos disponibles sin conexión.</p><button class="button button--primary" data-action="install-app">Instalar</button></div>` : ""}${!navigator.onLine ? `<div class="offline-banner">${icon("cloud")} Sin conexión. Cada cambio queda guardado en este dispositivo.</div>` : ""}${renderView()}</div></main><nav class="mobile-nav">${mnav("dashboard", "Inicio", "home")}${mnav("race", "Captura", "race")}${mnav("whatsapp", "Chat", "chat")}${mnav("participants", "Saldos", "users")}${mnav("reports", "Más", "menu", ["advanced", "history", "reports", "polla", "settings"])}</nav></div>${renderModal()}${renderCalendarOverlay()}`;
    applyVisualPreferences(); applyFocus(); syncShadowFeedPolling(); globalThis.__HIPICO_MARK_BOOT_OK__?.();
}
function renderView() {
    if (view === "race")
        return renderRace();
    if (view === "whatsapp")
        return renderWhatsapp();
    if (view === "advanced")
        return renderAdvanced();
    if (view === "participants")
        return renderParticipants();
    if (view === "history")
        return renderHistory();
    if (view === "reports")
        return renderReports();
    if (view === "polla")
        return renderPolla();
    if (view === "settings")
        return renderSettings();
    return renderDashboard();
}
function renderDashboard() {
    const day = activeDay(); const stats = dayStats(day); const races = stats.racesList; const group = activeGroup(); const total = allGroupMetrics();
    return `<section class="group-hero" style="${groupColorStyle(group)}"><div><div class="group-hero__logo">${brandMarkup("wordmark")}</div><span class="group-eyebrow">Grupo activo</span><h2>${escapeHtml(group.companyName)}</h2><p>${escapeHtml(group.name)} · ${escapeHtml(group.currency)} · tasa ${number(workspaceRateForDate(day?.date || today()))}</p></div><div class="row-actions"><button class="button" data-action="copy-metrics">${icon("copy")} Copiar métricas</button><button class="button" data-view="settings">Configurar grupo</button></div></section><section class="page-head"><div><h2>Jornada en un vistazo</h2><p>Controla uno o varios grupos en paralelo, registra sin pausas y revisa pendientes antes de cerrar.</p></div><div class="page-actions"><button class="button" data-action="show-tips">Cómo usar</button><button class="button button--primary" data-action="new-race">${icon("plus")} Nueva carrera</button></div></section><div class="grid grid--kpi metrics-grid"><article class="card kpi"><small>Grupos activos</small><strong>${total.activeGroups}</strong><span>${selectedCaptureGroupIds().length} en captura simultánea</span></article><article class="card kpi"><small>Apuestas totales</small><strong>${total.bets}</strong><span>${total.recent} en la última hora</span></article><article class="card kpi ${total.pending ? "kpi--danger" : ""}"><small>Pendientes</small><strong>${total.pending}</strong><span>${total.pending ? "Requieren seguimiento" : "Todo procesado"}</span></article><article class="card kpi"><small>Comisión consolidada</small><strong>${number(total.commission)}</strong><span>Vista multigrupo</span></article></div><section class="card section-gap"><div class="card__head"><div><h3>Actividad simultánea</h3><small>Cada grupo mantiene sus datos, carrera activa, clientes y totales propios.</small></div><div class="row-actions"><span class="badge badge--success">EN VIVO</span><button class="button button--small" data-action="copy-metrics">${icon("copy")} Copiar texto</button></div></div><div class="card__body group-metrics-grid">${total.groups.map((item) => `<button class="group-metric-card ${item.group.id === activeGroupId() ? "is-active" : ""}" style="${groupColorStyle(item.group)}" data-action="select-group" data-id="${item.group.id}"><i></i><div><strong>${escapeHtml(item.group.name)}</strong><span>${escapeHtml(item.group.companyName)}</span></div><dl><div><dt>Carreras</dt><dd>${item.races.length}</dd></div><div><dt>Apuestas</dt><dd>${item.bets.length}</dd></div><div><dt>Pendientes</dt><dd>${item.pending.length}</dd></div><div><dt>Volumen</dt><dd>${number(item.volume)}</dd></div></dl></button>`).join("")}</div></section><div class="grid grid--two section-gap"><section class="card"><div class="card__head"><h3>Carreras del día · ${escapeHtml(group.name)}</h3><button class="button button--small" data-action="new-race">Agregar</button></div><div class="card__body">${races.length ? `<div class="race-strip">${races.map(raceCard).join("")}</div>` : empty("No hay carreras", "Crea la primera y comienza a capturar.")}</div></section><section class="card"><div class="card__head"><h3>Atajos operativos</h3></div><div class="card__body quick-action-grid"><button class="quick-action" data-view="race">${icon("race")}<strong>Capturar</strong><span>Entrada ultrarrápida</span></button><button class="quick-action" data-view="advanced">${icon("plus")}<strong>Adelantadas</strong><span>Cargar por lote</span></button><button class="quick-action" data-view="history">${icon("report")}<strong>Historial</strong><span>Filtros y cortes</span></button><button class="quick-action" data-view="reports">${icon("check")}<strong>Cerrar</strong><span>Diario y semanal</span></button></div></section></div>`;
}
function empty(title, text) { return `<div class="empty"><strong>${title}</strong>${text}</div>`; }
function raceCard(r) { const count = (r.bets || []).filter((b) => b.status !== "cancelled").length; return `<button class="race-card race-card--button ${r.id === workspace.activeRaceId ? "is-selected" : ""}" data-action="select-race" data-id="${r.id}"><div><h4>${escapeHtml(r.racetrack)} · ${r.number}ª</h4><p>${count} apuestas · ${(r.board || []).filter(Boolean).join(".") || "sin pizarra"}</p></div><span class="badge badge--${r.status === "open" ? "success" : r.status === "locked" ? "warning" : "info"}">${r.status}</span></button>`; }
function raceSwitcher() {
    const day = activeDay(); const races = groupItems(workspace.races).filter((r) => r.dayId === day?.id);
    return `<div class="race-switcher"><button class="race-arrow" data-action="prev-race" aria-label="Carrera anterior">‹</button><div class="race-switcher__scroll">${races.map((r) => `<button class="race-pill ${r.id === activeRace()?.id ? "is-active" : ""}" data-action="select-race" data-id="${r.id}"><span>${escapeHtml(r.racetrack)}</span><strong>${r.number}ª</strong></button>`).join("")}</div><button class="race-arrow" data-action="next-race" aria-label="Carrera siguiente">›</button><button class="race-arrow race-arrow--add" data-action="new-race">+</button></div>`;
}
function renderRace() {
    const race = activeRace();
    if (!race)
        return `<section class="page-head"><div><h2>Sin carrera activa</h2><p>Crea una carrera o carga una adelantada.</p></div><button class="button button--primary" data-action="new-race">Nueva carrera</button></section>`;
    const tabs = [["capture", "Captura"], ["risk", "Riesgo"], ["board", "Pizarra"], ["plan", "WhatsApp"]];
    return `${raceSwitcher()}<section class="page-head compact-head"><div><h2>${escapeHtml(race.racetrack)} · ${race.number}ª</h2><p>${shortDate(race.date)} · Tasa ${number(race.exchangeRate)} · ${race.status}</p></div><div class="page-actions">${race.status === "open" ? `<button class="button button--danger" data-action="lock-race">Cerrar recepción</button>` : race.status === "locked" ? `<button class="button" data-action="unlock-race">Reabrir</button>` : ""}</div></section><div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${raceTab === id ? "is-active" : ""}" data-tab="${id}">${label}</button>`).join("")}</div><div class="section-gap">${raceTab === "risk" ? renderRisk(race) : raceTab === "board" ? renderBoard(race) : raceTab === "plan" ? renderPlan(race) : renderCapture(race)}</div>`;
}
function participantDatalist() { return ""; }
function lastBet(race) { return [...(race.bets || [])].reverse().find((b) => b.status !== "cancelled") || null; }
function recentCodes(role) { const out = []; for (const r of [...groupItems(workspace.races)].reverse()) for (const b of [...(r.bets || [])].reverse()) { const c = pCode(role === "receiver" ? b.receiverId : b.playerId); if (c && !out.includes(c)) out.push(c); if (out.length >= 6) return out; } return out; }
function renderCapture(race) {
    const editable = race.status === "open"; const latest = lastBet(race); const active = (race.bets || []).filter((b) => b.status !== "cancelled"); const group = activeGroup();
    const playValue = latest?.play || "1/2", horseValue = latest?.horse || "", receiverValue = pCode(latest?.receiverId);
    const simultaneous = selectedCaptureGroupIds();
    return `<details class="usage-tips"><summary>${icon("check")} Consejos para capturar más rápido</summary><div><span>1. Usa la línea <b>1/2 8 15000 cc bladi</b>.</span><span>2. Los chips no abren el teclado ni cambian tu posición.</span><span>3. Desliza verticalmente con normalidad para recorrer toda la cabina.</span><span>4. Activa varios grupos para registrar la misma jugada en paralelo.</span></div></details><div class="capture-layout capture-layout--v19"><section class="card speed-console"><div class="card__head"><div><h3>Captura continua</h3><small>${escapeHtml(group.companyName)} · ${escapeHtml(group.currency)}</small></div><span class="live-indicator ${editable ? "is-live" : ""}">${editable ? "RECIBIENDO" : "CERRADA"}</span></div><div class="card__body"><section class="simultaneous-panel"><div><strong>Grupos que reciben esta apuesta</strong><small>Se crean carreras equivalentes y clientes por código cuando sea necesario.</small></div><div class="capture-group-chips">${groupList().filter((item) => item.active !== false).map((item) => `<button type="button" class="capture-group-chip ${simultaneous.includes(item.id) ? "is-selected" : ""}" style="${groupColorStyle(item)}" data-action="toggle-capture-group" data-id="${item.id}" aria-pressed="${simultaneous.includes(item.id)}"><i></i><span>${escapeHtml(item.name)}</span>${simultaneous.includes(item.id) ? icon("check") : ""}</button>`).join("")}</div></section><form id="quick-bet-form" class="one-line-capture" autocomplete="off"><input class="input input--mega" name="quick" data-fast-input placeholder="1/2 8 15000 cc bladi" enterkeyhint="done" ${editable ? "" : "disabled"}><button class="button button--primary button--xl" name="submitMode" value="plain" ${editable ? "" : "disabled"}>Guardar</button><button class="button button--success" name="submitMode" value="copy" ${editable ? "" : "disabled"}>Guardar + copiar</button></form><div class="micro-help"><kbd>/</kbd> enfoca la línea · ${simultaneous.length} grupo(s) seleccionado(s) · <code>SIN=1,2</code></div><form id="bet-form" class="guided-capture" autocomplete="off"><div class="capture-core-v14"><div class="field"><label>Jugada</label><input class="input" name="play" value="${escapeHtml(playValue)}" required ${editable ? "" : "disabled"}></div><div class="field"><label>Caballo</label><input class="input" name="horse" value="${escapeHtml(horseValue)}" placeholder="8 o PA*IM" required ${editable ? "" : "disabled"}></div><div class="field"><label>Monto (${escapeHtml(activeCurrency())})</label><input class="input input--amount" name="amount" inputmode="decimal" placeholder="15000" data-zero-clear required ${editable ? "" : "disabled"}><small class="conversion-preview" data-amount-conversion></small></div>${participantInput("playerCode", "Juega", "", true, "CC")}${participantInput("receiverCode", "Consigue", receiverValue, false, "BLADI")}<div class="field field--compact"><label>Sin el</label><input class="input" name="without" value="${escapeHtml(latest?.without || "")}" placeholder="1,2" ${editable ? "" : "disabled"}></div></div><div class="speed-ribbons"><div><span>Jugada</span><div class="chip-row">${workspace.config.quickPlays.map((x) => `<button type="button" class="quick-chip ${x === playValue ? "is-selected" : ""}" data-action="set-field" data-field="play" data-value="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div></div><div><span>Monto</span><div class="chip-row">${workspace.config.quickAmounts.map((x) => `<button type="button" class="quick-chip" data-action="set-field" data-field="amount" data-value="${x}">${number(x)}</button>`).join("")}</div></div><div><span>Juega reciente</span><div class="chip-row">${recentCodes("player").map((x) => `<button type="button" class="quick-chip quick-chip--person" data-action="set-field" data-field="playerCode" data-value="${escapeHtml(x)}">${escapeHtml(x.toUpperCase())}</button>`).join("")}</div></div><div><span>Consigue reciente</span><div class="chip-row">${recentCodes("receiver").map((x) => `<button type="button" class="quick-chip quick-chip--person" data-action="set-field" data-field="receiverCode" data-value="${escapeHtml(x)}">${escapeHtml(x.toUpperCase())}</button>`).join("")}</div></div></div><div class="capture-actions sticky-capture-actions"><button type="button" class="button" data-action="use-available" ${editable ? "" : "disabled"}>Jugar disponible</button><button class="button button--primary" name="submitMode" value="plain" ${editable ? "" : "disabled"}>Guardar</button><button class="button button--success" name="submitMode" value="copy" ${editable ? "" : "disabled"}>Guardar + copiar</button><button class="button" name="submitMode" value="whatsapp" ${editable ? "" : "disabled"}>WhatsApp</button></div></form></div></section><aside class="card mini-receipt"><div class="card__head"><h3>Última jugada</h3>${latest ? `<span class="badge">${escapeHtml(latest.play)}</span>` : ""}</div><div class="card__body">${latest ? `<pre class="plan-preview plan-preview--compact">${escapeHtml(generateBetReceiptText(workspace, race, latest))}</pre><div class="row-actions"><button class="button button--small" data-action="copy-bet" data-id="${latest.id}">${icon("copy")} Copiar</button><button class="button button--small button--success" data-action="whatsapp-bet" data-id="${latest.id}">WhatsApp</button><button class="button button--small" data-action="duplicate-bet" data-id="${latest.id}">Repetir</button></div>` : empty("Sin apuestas", "La última aparecerá aquí.")}</div></aside></div><section class="card section-gap"><div class="card__head"><div><h3>Registro inmediato</h3><small>La más reciente aparece primero</small></div><span class="badge">${active.length}</span></div><div class="card__body">${active.length ? `<div class="bet-list">${[...active].reverse().map((b) => betCard(b, race)).join("")}</div>` : empty("Sin apuestas", "Usa la línea rápida o el formulario guiado.")}</div></section>`;
}
function betCard(b, race) { const map = pMap(), p = map.get(b.playerId), r = map.get(b.receiverId); return `<article class="bet-card"><div class="bet-card__main"><div><span class="badge">${escapeHtml(b.play)}</span> <strong>(${escapeHtml(String(b.horse).replace(/\*/g, "x"))})</strong> · ${number(b.amount)}</div><div class="bet-people"><span>${escapeHtml((p === null || p === void 0 ? void 0 : p.code) || "-")} → ${escapeHtml((r === null || r === void 0 ? void 0 : r.code) || "TAQUILLA")}</span>${b.source === "advanced" ? `<span class="badge badge--info">Adelantada</span>` : ""}</div><div class="bet-result">${b.settlement ? money(b.settlement.playerAmount, activeCurrency(), true) : "Pendiente"}</div></div><div class="bet-card__actions"><button class="button button--small" data-action="copy-bet" data-id="${b.id}">Copiar</button><button class="button button--small" data-action="duplicate-bet" data-id="${b.id}">Repetir</button>${race.status === "open" ? `<button class="button button--small button--danger" data-action="cancel-bet" data-id="${b.id}">Anular</button>` : ""}</div></article>`; }
function riskRows(race) { const participants = groupParticipants(); const balances = new Map(participants.map((p) => [p.id, balanceAt(p.id)])); return calculateRiskMatrix(race, participants, balances); }
function renderRisk(race) {
    const rows = riskRows(race).filter((x) => x.exposures.length); const selectionSet = [...new Set(rows.flatMap((r) => r.exposures.map((e) => e.selection)))];
    const totalRisk = rows.reduce((sum, row) => sum + Number(row.totalRisk || 0), 0); const over = rows.filter((row) => !row.free && row.remaining < 0).length;
    return `<section class="card risk-section"><div class="card__head"><div><h3>Matriz de riesgo</h3><small>Desliza verticalmente; en móvil cada registro se presenta como tarjeta.</small></div><div class="row-actions"><button class="button button--small" data-action="copy-risk-text">Copiar texto</button><button class="button button--small" data-action="export-risk">CSV</button></div></div><div class="card__body"><div class="risk-kpis"><article><small>Exposición total</small><strong>${money(totalRisk, activeCurrency())}</strong></article><article class="${over ? "is-danger" : ""}"><small>Disponibles excedidos</small><strong>${over}</strong></article><article><small>Participantes expuestos</small><strong>${rows.length}</strong></article><article><small>Selecciones</small><strong>${selectionSet.length}</strong></article></div>${rows.length ? `<div class="risk-summary">${rows.map((r) => `<article class="risk-card ${!r.free && r.remaining < 0 ? "is-over" : ""}"><div><strong>${escapeHtml(r.participant.code.toUpperCase())}</strong><span>${r.free ? "Libre" : `Disponible ${money(r.available, activeCurrency())}`}</span></div><div><small>Riesgo</small><b>${money(r.totalRisk, activeCurrency())}</b></div><div><small>Restante</small><b>${r.free ? "LIBRE" : money(r.remaining, activeCurrency(), true)}</b></div><div class="risk-tags">${r.exposures.map((e) => `<span>${escapeHtml(e.selection)} · J ${number(e.player)} / C ${number(e.receiver)}</span>`).join("")}</div></article>`).join("")}</div><div class="table-wrap section-gap desktop-risk-table"><table class="summary-table responsive-table"><thead><tr><th>Tercio</th>${selectionSet.map((sel) => `<th>${escapeHtml(sel)}</th>`).join("")}<th>Riesgo total</th><th>Disponible</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="Tercio"><strong>${escapeHtml(r.participant.code.toUpperCase())}</strong></td>${selectionSet.map((sel) => { const e = r.exposures.find((x) => x.selection === sel); return `<td data-label="${escapeHtml(sel)}">${e ? number(Math.abs(e.player - e.receiver)) : "—"}</td>`; }).join("")}<td data-label="Riesgo total">${number(r.totalRisk)}</td><td data-label="Disponible">${r.free ? "LIBRE" : number(r.remaining)}</td></tr>`).join("")}</tbody></table></div>` : empty("Sin exposición", "Registra apuestas para calcular el riesgo.")}</div></section>`;
}
function renderBoard(race) {
    const canSettle = ["open", "locked"].includes(race.status) && (race.bets || []).some((b) => b.status === "pending");
    return `<div class="grid grid--two"><section class="card"><div class="card__head"><h3>Pizarra oficial</h3><span class="badge">Permite empates</span></div><div class="card__body"><form id="board-form" class="form"><div class="board-grid board-grid--paired">${Array.from({ length: 6 }, (_, i) => { var _a, _b; return `<div class="board-pair"><label>Orden ${i + 1}</label><div><input class="input position-input" name="position${i}" type="number" min="1" max="6" value="${((_a = race.boardPositions) === null || _a === void 0 ? void 0 : _a[i]) || i + 1}" aria-label="Posición"><input class="input" name="horse${i}" value="${escapeHtml(((_b = race.board) === null || _b === void 0 ? void 0 : _b[i]) || "")}" placeholder="Caballo" aria-label="Caballo"></div></div>`; }).join("")}</div><div class="field"><label>Retirados</label><input class="input" name="retired" value="${escapeHtml((race.retired || []).join(", "))}" placeholder="1, 4, 9"></div><div class="capture-actions"><button class="button" type="submit">Guardar pizarra</button>${canSettle ? `<button class="button button--primary" type="button" data-action="settle-race">Procesar resultados</button>` : race.status === "settled" ? `<button class="button" type="button" data-action="reopen-settlement">Reabrir</button><button class="button button--success" type="button" data-action="close-race">Finalizar</button>` : ""}</div></form></div></section><section class="card"><div class="card__head"><h3>Control</h3></div><div class="card__body">${settlementControl(race)}</div></section></div>`;
}
function settlementControl(race) { const valid = (race.bets || []).filter((b) => b.status !== "cancelled"), settled = valid.filter((b) => b.status === "settled"); const diff = roundMoney(settled.reduce((s, b) => { var _a, _b, _c; return s + Number(((_a = b.settlement) === null || _a === void 0 ? void 0 : _a.playerAmount) || 0) + Number(((_b = b.settlement) === null || _b === void 0 ? void 0 : _b.receiverAmount) || 0) + Number(((_c = b.settlement) === null || _c === void 0 ? void 0 : _c.commissionAmount) || 0); }, 0)); return `<div class="control-stack"><div><span>Apuestas válidas</span><strong>${valid.length}</strong></div><div><span>Liquidadas</span><strong>${settled.length}</strong></div><div><span>Comisión</span><strong>${money(settled.reduce((s, b) => { var _a; return s + Number(((_a = b.settlement) === null || _a === void 0 ? void 0 : _a.commissionAmount) || 0); }, 0), activeCurrency())}</strong></div><div><span>Diferencia</span><strong class="${Math.abs(diff) < .01 ? "amount-positive" : "amount-negative"}">${money(diff, activeCurrency(), true)}</strong></div></div><div class="notice notice--success section-gap-small">PA, IM y RE ya se evalúan con las reglas de paridad, imparidad, resto y empates reconstruidas del Excel.</div>`; }
function renderPlan(race) { const text = generateWhatsappText(workspace, race); const summary = calculateRaceSummary(race, pMap()); return `<div class="grid grid--two"><section class="card"><div class="card__head"><h3>Plano WhatsApp</h3><div class="row-actions"><button class="button button--small" data-action="copy-plan">Copiar</button><button class="button button--small button--success" data-action="whatsapp-plan">WhatsApp</button><button class="button button--small" data-action="share-plan">Compartir</button></div></div><div class="card__body"><pre class="plan-preview">${escapeHtml(text)}</pre></div></section><section class="card"><div class="card__head"><h3>Totales por tercio</h3></div><div class="card__body">${summary.length ? `<table class="summary-table"><tbody>${summary.map((x) => `<tr><td>${escapeHtml(x.name)}</td><td class="${x.amount >= 0 ? "amount-positive" : "amount-negative"}">${money(x.amount, activeCurrency(), true)}</td></tr>`).join("")}</tbody></table>` : empty("Sin liquidar", "Procesa la pizarra para obtener totales.")}<div class="capture-actions section-gap"><button class="button" data-action="export-race">CSV</button><button class="button" data-action="print">Imprimir/PDF</button></div></div></section></div>`; }

function chatParticipant(sender, phone = "") {
    return groupItems(workspace.participants).find((participant) => participantMatchesSender(participant, sender, phone));
}
function chatPersonLabel(sender, phone = "") {
    const participant = chatParticipant(sender, phone);
    return participant ? `${participant.code.toUpperCase()} · ${participant.name}` : `${sender} · sin vincular`;
}
function sameTrack(left, right) {
    const clean = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return clean(left) === clean(right);
}
function chatMatchApproved(match) {
    return !match?.requiresApproval || chatApprovedMatchIds.has(match.id);
}
function chatReplyStatus(reply) {
    if (reply.status === "confirmed") return { label: "CONFIRMACIÓN", cls: "badge--success" };
    if (reply.status === "pending") return { label: "DEBE CONFIRMAR", cls: "badge--warning" };
    if (reply.status === "proposal") return { label: "MONTO PROPUESTO", cls: "badge--info" };
    return { label: "REVISAR", cls: "badge--warning" };
}
function shadowBadge() {
    if (mode !== "cloud") return { label: "SOLO DISPOSITIVO", cls: "badge--warning" };
    if (shadowFeed.status === "loading") return { label: "ACTUALIZANDO", cls: "badge--info" };
    if (shadowFeed.status === "error") return { label: "SIN CONEXIÓN", cls: "badge--warning" };
    if (shadowFeed.status === "ready") return { label: "SHADOW ACTIVO", cls: "badge--success" };
    return { label: "PENDIENTE", cls: "badge--warning" };
}
function renderShadowFeed() {
    const badge = shadowBadge();
    const items = shadowFeed.items || [];
    const content = mode !== "cloud"
        ? `<div class="notice">Inicia sesión con nube para consultar las evaluaciones del Bridge. La captura local continúa disponible.</div>`
        : shadowFeed.status === "loading" && !items.length
            ? `<div class="empty-state-card compact">${icon("cloud")}<p>Consultando las últimas evaluaciones shadow…</p></div>`
            : shadowFeed.status === "error"
                ? `<div class="notice notice--warning"><strong>No se pudo actualizar el Bridge.</strong><span>${escapeHtml(shadowFeed.error || "Comprueba la conexión y vuelve a intentar.")}</span></div>`
                : items.length
                    ? `<div class="bridge-evaluation-list">${items.map((item) => {
                        const payload = item.predicted_payload || {};
                        const confidence = Math.round(Math.max(0, Math.min(1, Number(payload.confidence || 0))) * 100);
                        const intent = String(payload.intent || item.prediction_type || "sin_clasificar").replaceAll("_", " ");
                        const risk = String(payload.risk || "review").toUpperCase();
                        const suggestion = payload.suggestion || payload.reason || "Clasificación registrada; revisión del operador requerida.";
                        return `<article class="bridge-evaluation"><header><div><strong>${escapeHtml(intent)}</strong><small>${escapeHtml(item.source_group_key || "grupo fuente")} → ${escapeHtml(item.lab_group_key || "LAB")}</small></div><span class="badge ${risk === "LOW" ? "badge--success" : "badge--warning"}">${escapeHtml(risk)} · ${confidence}%</span></header><p>${escapeHtml(suggestion)}</p><footer><span>${escapeHtml(item.match_status || "pending")}</span><time>${new Date(item.predicted_at).toLocaleString("es-VE")}</time></footer></article>`;
                    }).join("")}</div>`
                    : `<div class="empty-state-card compact">${icon("chat")}<p>Aún no hay evaluaciones visibles para esta cuenta.</p></div>`;
    return `<section class="card bridge-live-card"><div class="card__head"><div><h3>Bridge oficial → LAB</h3><small>Lectura continua del grupo fuente; simulaciones y respuestas únicamente en Control hípico lab.</small></div><div class="row-actions"><span class="badge ${badge.cls}">${badge.label}</span><button type="button" class="button button--small" data-action="refresh-shadow-feed">Actualizar</button></div></div><div class="card__body">${content}<p class="muted bridge-safety-line">El grupo fuente permanece solo lectura. Ninguna evaluación crea apuestas, modifica saldos ni envía respuestas al grupo oficial.</p></div></section>`;
}
async function refreshShadowFeed(silent = false) {
    if (mode !== "cloud" || !currentSession() || !navigator.onLine || shadowFeed.status === "loading") return;
    shadowFeed = { ...shadowFeed, status: "loading", error: "" };
    if (!silent && view === "whatsapp") render();
    try {
        const items = await fetchRecentShadowEvaluations(12);
        shadowFeed = { status: "ready", items: Array.isArray(items) ? items : [], error: "", updatedAt: now() };
        if (!silent) toast("Evaluaciones shadow actualizadas.", "success");
    }
    catch (error) {
        shadowFeed = { ...shadowFeed, status: "error", error: error.message || "No se pudo consultar el Bridge." };
        if (!silent) toast(shadowFeed.error, "error");
    }
    if (view === "whatsapp") render();
}
function syncShadowFeedPolling() {
    if (shadowRefreshTimer) {
        clearInterval(shadowRefreshTimer);
        shadowRefreshTimer = null;
    }
    if (view !== "whatsapp" || mode !== "cloud" || !currentSession()) return;
    if (shadowFeed.status === "idle") setTimeout(() => refreshShadowFeed(true), 0);
    shadowRefreshTimer = setInterval(() => {
        if (document.visibilityState === "visible" && view === "whatsapp" && navigator.onLine) refreshShadowFeed(true);
    }, 30000);
}
function renderWhatsapp() {
    const race = activeRace();
    const analysis = chatAnalysis;
    const imported = new Set(workspace.chatImports || []);
    const eligibleByTrack = analysis?.matches?.filter((match) => !match.track || !race || sameTrack(match.track, race.racetrack)) || [];
    const approvedMatches = eligibleByTrack.filter(chatMatchApproved);
    const newMatches = approvedMatches.filter((match) => !imported.has(match.id));
    const pendingReview = eligibleByTrack.filter((match) => match.requiresApproval && !chatApprovedMatchIds.has(match.id) && !imported.has(match.id));
    const latestBoard = analysis?.boards?.at(-1);
    return `<section class="page-head"><div><h2>Control desde el chat de WhatsApp</h2><p>Pega mensajes copiados o exportados. La aplicación separa ofertas directas, respuestas sobre mensajes citados, repeticiones, cierres, llegada y parejas entre quien juega y quien consigue.</p></div><div class="page-actions"><button class="button" data-action="copy-closure">Copiar cierre</button><button class="button button--primary" data-action="copy-plan">Copiar plano</button></div></section>
    <div class="chat-safety-note"><strong>Lectura segura y local</strong><span>La app no abre conversaciones por sí sola. Puedes pegar un bloque manualmente o consultar la lectura shadow que el Bridge persiste con tu sesión. Las respuestas citadas como “30k”, “J”, “Jugando” o “Debe confirmar” se muestran para revisión y no crean apuestas falsas.</span></div>
    ${renderShadowFeed()}
    <section class="card chat-import-card"><div class="card__head"><div><h3>Pegar mensajes</h3><small>${race ? `${escapeHtml(race.racetrack)} · ${race.number}ª carrera activa` : "Primero crea o abre una carrera"}</small></div>${analysis ? `<button class="button button--small" data-action="clear-chat-analysis">Limpiar</button>` : ""}</div><div class="card__body"><form id="whatsapp-parse-form" class="form"><div class="field"><label>Conversación o bloque copiado</label><textarea class="textarea chat-textarea" name="chat" rows="12" placeholder="[10:07 p. m., 6/8/2026] Participante: Juego 3n del 5 con 100k">${escapeHtml(chatDraft)}</textarea></div><div class="capture-actions"><button class="button button--primary">Analizar mensajes</button><button type="button" class="button" data-action="paste-chat">Pegar portapapeles</button></div></form></div></section>
    ${!analysis ? `<section class="empty-state-card">${icon("chat")}<h3>Listo para recibir el chat</h3><p>Entiende “Juego 2y2 del 5 con 40k”, “Consigo 2n del 1 con 30k”, “Sf”, “Se fue”, respuestas citadas, mensajes de cierre y “Llegada 2.1.6.4”.</p></section>` : `
    <div class="grid grid--kpi chat-kpis"><article class="card kpi"><small>Mensajes</small><strong>${analysis.stats.messages}</strong><span>${analysis.stats.segments} bloque(s) por cierre</span></article><article class="card kpi"><small>Ofertas directas</small><strong>${analysis.stats.offers}</strong><span>${analysis.stats.duplicates} repetidas</span></article><article class="card kpi"><small>Respuestas citadas</small><strong>${analysis.stats.replies}</strong><span>${analysis.stats.pending} por confirmar</span></article><article class="card kpi"><small>Parejas</small><strong>${analysis.stats.matches}</strong><span>${newMatches.length} listas · ${pendingReview.length} por validar</span></article><article class="card kpi ${analysis.stats.unmatched ? "kpi--danger" : ""}"><small>Sin pareja</small><strong>${analysis.stats.unmatched}</strong><span>Revisión manual</span></article></div>
    <section class="card section-gap"><div class="card__head"><div><h3>Parejas detectadas</h3><small>Solo se importan las compatibles con la carrera activa. Las notaciones ambiguas requieren validación del operador.</small></div><button class="button button--success" data-action="import-chat-matches" ${newMatches.length && race?.status === "open" ? "" : "disabled"}>Importar ${newMatches.length}</button></div><div class="card__body chat-match-list">${analysis.matches.map((match) => { const already = imported.has(match.id); const compatible = !match.track || !race || sameTrack(match.track, race.racetrack); const approved = chatMatchApproved(match); const status = already ? "IMPORTADA" : !compatible ? "OTRA CARRERA" : !approved ? "VALIDAR" : "LISTA"; return `<article class="chat-match ${already ? "is-imported" : !compatible ? "is-incompatible" : !approved ? "is-review" : ""}"><header><div><span class="badge">${escapeHtml(match.play)} · (${escapeHtml(String(match.horse).replace(/\*/g, "x"))})</span>${match.requiresApproval ? `<span class="badge badge--warning">Revisión obligatoria</span>` : ""}</div><strong>${number(match.amount)} ${escapeHtml(activeCurrency())}</strong></header><div class="chat-sides"><div><small>Juega</small><b>${escapeHtml(chatPersonLabel(match.player, match.playerPhone))}</b></div><span>↔</span><div><small>Consigue / da</small><b>${escapeHtml(chatPersonLabel(match.receiver, match.receiverPhone))}</b></div></div>${match.reviewReasons?.length ? `<p class="chat-review-reason">${escapeHtml(match.reviewReasons.join(" · "))}</p>` : ""}<footer><span>Bloque ${match.segmentId || 1} · ${match.track ? escapeHtml(match.track) : "hipódromo asumido de la carrera activa"}</span><div class="row-actions">${match.requiresApproval && !already && compatible ? `<button class="button button--small ${approved ? "button--success" : ""}" data-action="toggle-chat-match-approval" data-id="${escapeHtml(match.id)}">${approved ? "Validada" : "Validar"}</button>` : ""}<b>${status}</b></div></footer></article>`; }).join("") || empty("Sin parejas exactas", "Las ofertas directas de Juega y Consigue deben coincidir en jugada, caballo y bloque.")}</div></section>
    <section class="card section-gap"><div class="card__head"><div><h3>Respuestas sobre mensajes citados</h3><small>WhatsApp puede mostrar primero la cita y debajo la respuesta real. Estas señales ayudan al operador, pero no se importan automáticamente.</small></div><span class="badge">${analysis.replies.length}</span></div><div class="card__body chat-reply-list">${analysis.replies.map((reply) => { const meta = chatReplyStatus(reply); return `<article class="chat-reply"><header><div><strong>${escapeHtml(chatPersonLabel(reply.sender, reply.phone))}</strong><small>Bloque ${reply.segmentId || 1}</small></div><span class="badge ${meta.cls}">${meta.label}</span></header><div class="chat-reply__content"><div><small>Mensaje citado</small><p>${escapeHtml(reply.quotedText)}</p></div><div><small>Respuesta enviada</small><p>${escapeHtml(reply.responseText)}</p></div></div><footer><span>${reply.linkedOffer ? `Vinculada a la oferta de ${escapeHtml(reply.linkedOffer.sender)} · ${escapeHtml(reply.linkedOffer.play)} (${escapeHtml(String(reply.linkedOffer.horse).replace(/\*/g, "x"))}) · ${number(reply.linkedOffer.amount)}` : "No se pudo reconstruir la oferta completa"}</span><b>${reply.responseAmount ? `${number(reply.responseAmount)} ${escapeHtml(activeCurrency())}` : "Sin monto importable"}</b></footer></article>`; }).join("") || `<p class="muted">No se encontraron respuestas citadas en este bloque.</p>`}</div></section>
    <section class="chat-columns section-gap"><article class="card"><div class="card__head"><div><h3>Ofertas sin pareja</h3><small>No se convierten en apuesta hasta que aparezca una contraparte directa y verificable.</small></div><span class="badge">${analysis.unmatched.length}</span></div><div class="card__body chat-offer-list">${analysis.unmatched.map((offer) => `<div><span class="role-dot role-dot--${offer.role}"></span><p><b>${escapeHtml(offer.role === "player" ? "Juega" : "Consigue")}</b> ${escapeHtml(chatPersonLabel(offer.sender, offer.phone))}<small>Bloque ${offer.segmentId || 1} · ${escapeHtml(offer.play)} (${escapeHtml(String(offer.horse).replace(/\*/g, "x"))}) · ${number(offer.amount)} · ${escapeHtml(offer.track || "sin hipódromo escrito")}</small></p></div>`).join("") || `<p class="muted">Todas las ofertas directas quedaron emparejadas.</p>`}</div></article><article class="card"><div class="card__head"><div><h3>Señales operativas</h3><small>Cierres, confirmaciones y llegada encontrados en el bloque.</small></div></div><div class="card__body signal-list"><div><span>Cierres</span><b>${analysis.closures.length}</b></div><div><span>Confirmaciones J / Jugando / Sf / Se fue</span><b>${analysis.confirmations.length}</b></div><div><span>Debe confirmar</span><b>${analysis.pendingConfirmations.length}</b></div><div><span>Llegadas o pizarras</span><b>${analysis.boards.length}</b></div>${latestBoard ? `<button class="button button--primary" data-action="apply-chat-board">Aplicar llegada ${escapeHtml(latestBoard.board.join("."))}</button>` : ""}</div></article></section>`}
    <section class="card section-gap chat-workflow"><div class="card__head"><h3>Flujo recomendado del operador</h3></div><div class="card__body"><ol><li>Abre la carrera correcta y pega los mensajes recibidos.</li><li>Revisa los bloques separados por cada mensaje de cierre; una oferta anterior no se cruza con la carrera siguiente.</li><li>Vincula teléfonos con participantes desde Saldos.</li><li>Revisa las respuestas citadas: “30k” es una propuesta, “Jugando/Sf” una señal y “Debe confirmar” continúa pendiente.</li><li>Importa solo parejas directas y validadas; luego copia cierre, plano, llegada y saldos.</li></ol></div></section>`;
}


function renderAdvanced() {
    const staged = groupItems(workspace.advancedBets).filter((b) => b.status === "staged");
    const groups = new Map();
    for (const b of staged) {
        const key = `${b.date}|${b.racetrack}|${b.raceNumber}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(b);
    }
    return `<section class="page-head"><div><h2>Apuestas adelantadas</h2><p>Prepara carreras futuras, importa líneas en bloque y pásalas a la carrera activa con un toque.</p></div><div class="page-actions"><button class="button" data-action="paste-advanced">Pegar lote</button><button class="button button--primary" data-action="new-advanced">${icon("plus")} Nueva adelantada</button></div></section><div class="notice">Formato de lote: <code>2026-08-06 | Parx Racing | 4 | 1/2 | 5 | 12000 | cc | chivo | SIN=</code>. Una línea por apuesta.</div><div class="section-gap">${groups.size ? [...groups.entries()].map(([key, bets]) => { const [date, track, num] = key.split("|"); return `<section class="card advanced-group"><div class="card__head"><div><h3>${escapeHtml(track)} · ${num}ª</h3><small>${shortDate(date)} · ${bets.length} apuestas</small></div><div class="row-actions"><button class="button button--small button--primary" data-action="load-advanced-group" data-key="${escapeHtml(key)}">Crear/cargar carrera</button><button class="button button--small button--danger" data-action="clear-advanced-group" data-key="${escapeHtml(key)}">Borrar lote</button></div></div><div class="card__body"><div class="bet-list">${bets.map((b) => `<article class="advanced-row"><div><strong>${escapeHtml(b.play)} (${escapeHtml(String(b.horse).replace(/\*/g, "x"))})</strong><span>${number(b.amount)} · ${escapeHtml(pCode(b.playerId))} → ${escapeHtml(pCode(b.receiverId) || "TAQUILLA")}</span></div><button class="button button--small button--danger" data-action="delete-advanced" data-id="${b.id}">Quitar</button></article>`).join("")}</div></div></section>`; }).join("") : empty("Sin adelantadas", "Agrega apuestas futuras o pega un lote.")}</div>`;
}
function renderParticipants() { const rows = currentBalanceRows(); return `<section class="page-head"><div><h2>${escapeHtml(activeGroup().clientLabel || "Participantes")} · ${escapeHtml(activeGroup().name)}</h2><p>Datos totalmente independientes de los otros grupos.</p></div><div class="page-actions"><button class="button" data-action="copy-balances">Copiar disponibles</button><button class="button button--primary" data-action="new-participant">${icon("plus")} Participante</button></div></section><div class="participant-grid">${rows.map(({ participant, balance }) => { const available = participantAvailable(participant); return `<article class="card participant-card"><div class="participant-card__head"><div><strong>${escapeHtml(participant.code.toUpperCase())}</strong><span>${escapeHtml(participant.name)}</span>${participant.phone ? `<small>${escapeHtml(participant.phone)}</small>` : ""}</div><button class="button button--small" data-action="edit-participant" data-id="${participant.id}">Editar</button></div><div class="participant-money"><div><small>Saldo actual</small><b class="${balance >= 0 ? "amount-positive" : "amount-negative"}">${money(balance, activeCurrency(), true)}</b>${activeGroup().showConversion ? `<span>${activeCurrency() === "USD" ? `Bs. ${number(balance * workspaceRateForDate(today()))}` : `USD ${number(toUsd(balance, today()))}`}</span>` : ""}</div><div><small>Disponible + aval</small><b>${participant.pooled === false && Number(participant.avalBs || 0) === 0 && Number(participant.avalUsd || 0) === 0 ? "LIBRE" : money(available, activeCurrency(), true)}</b><span>Aval Bs. ${number(participant.avalBs || 0)} · USD ${number(participant.avalUsd || 0)}</span></div></div><div class="participant-week"><span>Semana anterior</span><strong>${money(participant.previousWeekBalance, activeCurrency(), true)}</strong></div></article>`; }).join("")}</div>`; }
function historyRows() { const rows = []; for (const race of groupItems(workspace.races)) for (const b of race.bets || []) { const base = { id: b.id, group: activeCompany(), date: race.date, racetrack: race.racetrack, race: race.number, description: `${b.play} (${String(b.horse).replace(/\*/g, "x")}) con ${number(b.amount)}`, type: b.source === "advanced" ? "Adelantada" : "Carrera", play: b.play, status: b.status }; if (b.playerId) rows.push({ ...base, role: "Juega", participantId: b.playerId, balanceBs: b.settlement?.playerAmount ?? 0, auxiliary: b.settlement?.code ?? "", rate: race.exchangeRate || workspaceRateForDate(race.date), balanceUsd: toUsd(b.settlement?.playerAmount ?? 0, race.date) }); if (b.receiverId) rows.push({ ...base, role: "Consigue", participantId: b.receiverId, balanceBs: b.settlement?.receiverAmount ?? 0, auxiliary: b.settlement?.code ?? "", rate: race.exchangeRate || workspaceRateForDate(race.date), balanceUsd: toUsd(b.settlement?.receiverAmount ?? 0, race.date) }); } return rows; }
function filteredHistory() { return historyRows().filter((r) => (!historyFilter.from || r.date >= historyFilter.from) && (!historyFilter.to || r.date <= historyFilter.to) && (!historyFilter.track || r.racetrack.toLowerCase().includes(historyFilter.track.toLowerCase())) && (!historyFilter.participant || r.participantId === historyFilter.participant) && (!historyFilter.type || r.play === historyFilter.type) && (!historyFilter.status || r.status === historyFilter.status)); }
function renderHistory() { const rows = filteredHistory(); return `<section class="page-head"><div><h2>Historial de jugadas</h2><p>${escapeHtml(activeGroup().name)} · filtros y cortes sin tablas cortadas en móvil.</p></div><div class="page-actions"><button class="button" data-action="history-this-week">Esta semana</button><button class="button" data-action="export-history">Exportar CSV</button></div></section><details class="card filter-card" open><summary>Filtros</summary><form id="history-filter-form"><div class="card__body filter-grid">${dateField("from", historyFilter.from || today(), "Desde")}${dateField("to", historyFilter.to || today(), "Hasta")}<input class="input" name="track" placeholder="Hipódromo" value="${escapeHtml(historyFilter.track)}"><select class="select" name="participant"><option value="">Todos los tercios</option>${participantOptions(historyFilter.participant)}</select><select class="select" name="type"><option value="">Todas las jugadas</option>${BET_OPTIONS.map((x) => `<option ${historyFilter.type === x ? "selected" : ""}>${x}</option>`).join("")}</select><select class="select" name="status"><option value="">Todos los estados</option><option value="pending" ${historyFilter.status === "pending" ? "selected" : ""}>Pendiente</option><option value="settled" ${historyFilter.status === "settled" ? "selected" : ""}>Liquidada</option><option value="cancelled" ${historyFilter.status === "cancelled" ? "selected" : ""}>Anulada</option></select><button class="button button--primary">Aplicar</button></div></form></details><section class="card section-gap"><div class="card__head"><h3>${rows.length} movimientos</h3><span class="badge">${escapeHtml(activeCurrency())} + conversión</span></div><div class="card__body"><div class="history-mobile-list">${rows.map((r) => `<article class="history-card"><header><strong>${escapeHtml(pCode(r.participantId))}</strong><span class="badge">${escapeHtml(r.role)}</span></header><h4>${escapeHtml(r.description)}</h4><p>${escapeHtml(r.racetrack)} · ${r.race}ª · ${escapeHtml(r.date)}</p><div><span>Saldo</span><b>${money(r.balanceBs, activeCurrency(), true)}</b></div><div><span>USD</span><b>${number(r.balanceUsd)}</b></div></article>`).join("") || empty("Sin movimientos", "Ajusta los filtros o registra apuestas.")}</div><div class="table-wrap history-desktop-table"><table class="summary-table history-table"><thead><tr><th>Fecha</th><th>Hipódromo</th><th>Carr.</th><th>Descripción</th><th>Tipo</th><th>Tercio</th><th>Saldo</th><th>Dólar</th><th>USD</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.date}</td><td>${escapeHtml(r.racetrack)}</td><td>${r.race}</td><td>${escapeHtml(r.description)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(pCode(r.participantId))}</td><td>${number(r.balanceBs)}</td><td>${number(r.rate)}</td><td>${number(r.balanceUsd)}</td></tr>`).join("")}</tbody></table></div></div></section>`; }
function renderReports() { const tabs = [["daily", "Cierre diario"], ["week", "Semana anterior"], ["balances", "Disponibles"], ["movements", "Movimientos"], ["audit", "Auditoría"]]; return `<section class="more-dashboard"><button data-view="advanced">${icon("plus")}<span>Adelantadas</span></button><button data-view="history">${icon("report")}<span>Historial</span></button><button data-view="polla">${icon("check")}<span>POLLA</span></button><button data-view="settings">${icon("settings")}<span>Configuración</span></button><button data-action="toggle-theme">${icon(workspace.config.theme === "dark" ? "sun" : "moon")}<span>Modo ${workspace.config.theme === "dark" ? "claro" : "oscuro"}</span></button><button class="is-danger" data-action="logout">${icon("logout")}<span>Cerrar sesión</span></button></section><section class="page-head"><div><h2>Cierres y saldos</h2><p>${escapeHtml(activeCompany())} · control diario y semanal.</p></div><div class="page-actions"><button class="button" data-action="new-movement">Movimiento</button><button class="button button--primary" data-action="close-day">Cerrar jornada</button></div></section><div class="tabs tabs--scroll">${tabs.map(([id, l]) => `<button class="tab ${reportTab === id ? "is-active" : ""}" data-report-tab="${id}">${l}</button>`).join("")}</div><div class="section-gap">${reportTab === "week" ? renderWeek() : reportTab === "balances" ? renderBalances() : reportTab === "movements" ? renderMovements() : reportTab === "audit" ? renderAudit() : renderDaily()}</div>`; }
function renderDaily() { const day = activeDay(), stats = dayStats(day); return `<div class="grid grid--two"><section class="card"><div class="card__head"><h3>Resumen de ${shortDate(day.date)}</h3></div><div class="card__body"><div class="control-stack"><div><span>Carreras</span><strong>${stats.races}</strong></div><div><span>Apuestas</span><strong>${stats.bets}</strong></div><div><span>Volumen</span><strong>${money(stats.volume, activeCurrency())}</strong></div><div><span>Comisión</span><strong>${money(stats.commission, activeCurrency())}</strong></div><div><span>Pendientes</span><strong>${stats.pending}</strong></div><div><span>Diferencia</span><strong>${money(stats.controlDifference, activeCurrency(), true)}</strong></div></div><div class="capture-actions section-gap"><button class="button" data-action="copy-daily">Copiar cierre</button><button class="button" data-action="export-daily-pdf">PDF diario</button><button class="button" data-action="export-daily-xlsx">Excel diario</button><button class="button" data-action="export-balances">CSV saldos</button></div></div></section><section class="card"><div class="card__head"><h3>Validaciones</h3></div><div class="card__body"><div class="check-list"><div class="${stats.pending ? "is-bad" : "is-good"}">${stats.pending ? "✕" : "✓"} Apuestas pendientes: ${stats.pending}</div><div class="${stats.openRaces.length ? "is-bad" : "is-good"}">${stats.openRaces.length ? "✕" : "✓"} Carreras sin finalizar: ${stats.openRaces.length}</div><div class="${Math.abs(stats.controlDifference) > .01 ? "is-bad" : "is-good"}">${Math.abs(stats.controlDifference) > .01 ? "✕" : "✓"} Diferencia: ${number(stats.controlDifference)}</div></div></div></section></div>`; }
function renderWeek() { const last = groupItems(workspace.weekClosures).at(-1); return `<div class="grid grid--two"><section class="card"><div class="card__head"><h3>Semana anterior</h3><div class="row-actions"><button class="button button--small" data-action="export-weekly-pdf">PDF</button><button class="button button--small" data-action="export-weekly-xlsx">Excel</button><button class="button button--small button--primary" data-action="close-week">Cerrar semana actual</button></div></div><div class="card__body">${last ? `<p class="muted">Corte ${last.from} al ${last.to}</p><div class="responsive-records">${last.balances.map((row) => `<article><strong>${escapeHtml(pCode(row.participantId))}</strong><span>${money(row.balance, activeCurrency(), true)}</span><small>USD ${number(toUsd(row.balance, last.to))}</small></article>`).join("")}</div>` : empty("Sin cierre semanal", "Pulsa Cerrar semana para guardar una fotografía de saldos.")}</div></section><section class="card"><div class="card__head"><h3>Variación actual</h3></div><div class="card__body"><div class="responsive-records">${groupItems(workspace.participants).map((p) => { const cur = balanceAt(p.id), prev = Number(p.previousWeekBalance || 0); return `<article><strong>${escapeHtml(p.code)}</strong><span>${money(cur - prev, activeCurrency(), true)}</span><small>Anterior ${money(prev, activeCurrency(), true)}</small></article>`; }).join("")}</div></div></section></div>`; }
function renderBalances() { const rows = currentBalanceRows(); const text = generateBalancesWhatsappText(workspace, rows); return `<div class="grid grid--two"><section class="card"><div class="card__head"><h3>TERCIO / DISPONIBLE</h3><div class="row-actions"><button class="button button--small" data-action="copy-balances">Copiar</button><button class="button button--small button--success" data-action="whatsapp-balances">WhatsApp</button><button class="button button--small" data-action="export-balances-pdf">PDF</button><button class="button button--small" data-action="export-balances-xlsx">Excel</button></div></div><div class="card__body"><pre class="plan-preview">${escapeHtml(text)}</pre></div></section><section class="card"><div class="card__head"><h3>Conversión</h3></div><div class="card__body"><p>Tasa actual: <strong>${number(workspaceRateForDate(today()))} Bs/USD</strong> · ${activeGroup().autoRate ? "se aplica automáticamente a nuevas carreras" : "manual"}</p><div class="responsive-records">${rows.map(({ participant, balance }) => `<article><strong>${escapeHtml(participant.code)}</strong><span>${money(balance, activeCurrency(), true)}</span>${activeGroup().showConversion ? `<small>${activeCurrency() === "USD" ? `Bs. ${number(balance * workspaceRateForDate(today()))}` : `USD ${number(toUsd(balance, today()))}`}</small>` : ""}</article>`).join("")}</div></div></section></div>`; }
function renderMovements() { const items = groupItems(workspace.movements); return `<section class="card"><div class="card__head"><h3>Transferencias, pozos y ajustes</h3><button class="button button--small" data-action="new-movement">Agregar</button></div><div class="card__body">${items.length ? `<div class="list">${[...items].reverse().map((m) => `<div class="audit-row"><strong>${escapeHtml(m.type.toUpperCase())} · ${escapeHtml(pCode(m.participantId))}${m.counterpartyId ? ` → ${escapeHtml(pCode(m.counterpartyId))}` : ""}</strong><span>${m.currency || "VES"} ${number(m.amount)} · ${escapeHtml(m.note || "")}</span><small>${new Date(m.createdAt).toLocaleString("es-VE")}</small></div>`).join("")}</div>` : empty("Sin movimientos", "Registra transferencias, pozos o ajustes.")}</div></section>`; }
function renderAudit() { const items = groupItems(workspace.audit).slice(0, 100); return `<section class="card"><div class="card__head"><h3>Auditoría</h3><span class="badge">${items.length}</span></div><div class="card__body"><div class="list">${items.map((a) => `<div class="audit-row"><strong>${escapeHtml(a.message)}</strong><span>${escapeHtml(a.action)} · ${escapeHtml(a.entityType)}</span><small>${new Date(a.createdAt).toLocaleString("es-VE")}</small></div>`).join("")}</div></div></section>`; }
function renderPolla() { const polla = groupItems(workspace.pollas)[0]; if (!polla) return `<section class="page-head"><div><h2>POLLA</h2><p>Crea una polla independiente para ${escapeHtml(activeGroup().name)}.</p></div><button class="button button--primary" data-action="new-polla">Crear</button></section>`; const calc = calculatePolla(polla); return `<section class="page-head"><div><h2>${escapeHtml(polla.name)}</h2><p>${escapeHtml(polla.racetrack)} · ${shortDate(polla.date)} · 5/3/1 puntos por posición</p></div><div class="page-actions"><button class="button" data-action="new-polla-entry">Agregar jugador</button><button class="button button--primary" data-action="save-polla-results">Actualizar resultados</button></div></section><div class="grid grid--kpi"><article class="card kpi"><small>Jugadores</small><strong>${calc.entries.length}</strong><span>Valor ${number(polla.ticketValue)}</span></article><article class="card kpi"><small>Total jugado</small><strong>${money(calc.totalPlayed, activeCurrency())}</strong><span>Administración ${money(calc.adminShare, activeCurrency())}</span></article><article class="card kpi"><small>Puntaje máximo</small><strong>${calc.maxScore}/30</strong><span>${calc.winners.length} ganador(es)</span></article><article class="card kpi"><small>Premio por ganador</small><strong>${money(calc.payoutPerWinner, activeCurrency())}</strong><span>${number(polla.bettorsPercent * 100)}% a apostadores</span></article></div><div class="grid grid--two section-gap"><section class="card"><div class="card__head"><h3>Resultados de las 6 válidas</h3></div><div class="card__body"><form id="polla-results-form" class="polla-valids">${polla.validResults.map((r, i) => `<div class="polla-valid"><strong>${i + 1}ª válida</strong><input class="input" name="first${i}" placeholder="1º: 3,7" value="${escapeHtml((r.first || []).join(","))}"><input class="input" name="second${i}" placeholder="2º" value="${escapeHtml((r.second || []).join(","))}"><input class="input" name="third${i}" placeholder="3º" value="${escapeHtml((r.third || []).join(","))}"></div>`).join("")}<button class="button button--primary">Actualizar puntuación</button></form></div></section><section class="card"><div class="card__head"><h3>Clasificación</h3></div><div class="card__body"><div class="responsive-records">${calc.entries.length ? [...calc.entries].sort((a, b) => b.score - a.score).map((e) => `<article><strong>${escapeHtml(pCode(e.participantId) || e.name)}</strong><span>${e.score} puntos</span><small>${escapeHtml(e.picks.join(" · "))}${calc.winners.some((w) => w.id === e.id) ? ` · Premio ${money(calc.payoutPerWinner, activeCurrency())}` : ""}</small></article>`).join("") : empty("Sin jugadores", "Agrega participantes y sus seis selecciones.")}</div></div></section></div>`; }
function bytesLabel(value) { const n = Number(value || 0); if (n < 1024)
    return `${n} B`; if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; }
function renderSettings() {
    const groups = groupList(); const group = activeGroup(); const percent = storageInfo.quota ? Math.min(100, (storageInfo.usage / storageInfo.quota) * 100) : 0; const user = cloudUser(); const backendStatus = mode === "cloud" && currentSession() ? "Conectado" : "Solo local";
    return `<section class="page-head"><div><h2>Configuración</h2><p>Grupos independientes, tema, moneda, tasa, WhatsApp y almacenamiento.</p></div><button class="button button--danger" data-action="logout">${icon("logout")} Cerrar sesión</button></section><section class="card group-manager"><div class="card__head"><div><h3>Grupos administrados</h3><small>Cada grupo conserva empresa, clientes, carreras, saldos y texto propios.</small></div><button class="button button--primary button--small" data-action="new-group">${icon("plus")} Agregar grupo</button></div><div class="card__body group-card-grid">${groups.map((item) => `<button type="button" class="group-config-card ${item.id === group.id ? "is-active" : ""}" style="${groupColorStyle(item)}" data-action="select-group" data-id="${item.id}"><i></i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.companyName)}</span><small>${escapeHtml(item.currency)} · ${groupItems(workspace.participants, item.id).length} clientes</small></div></button>`).join("")}</div></section><section class="card section-gap"><div class="card__head"><div><h3>Operación simultánea</h3><small>Selecciona los grupos que recibirán una misma apuesta durante la captura.</small></div><span class="badge badge--success">${selectedCaptureGroupIds().length} activos</span></div><div class="card__body"><div class="capture-group-chips capture-group-chips--settings">${groups.filter((item) => item.active !== false).map((item) => `<button type="button" class="capture-group-chip ${selectedCaptureGroupIds().includes(item.id) ? "is-selected" : ""}" style="${groupColorStyle(item)}" data-action="toggle-capture-group" data-id="${item.id}"><i></i><span>${escapeHtml(item.name)}</span>${selectedCaptureGroupIds().includes(item.id) ? icon("check") : ""}</button>`).join("")}</div><p class="muted">La carrera equivalente se crea automáticamente en cada grupo seleccionado. Los participantes se relacionan por código y sus saldos permanecen separados.</p></div></section><div class="grid grid--two section-gap"><section class="card"><div class="card__head"><h3>Datos de ${escapeHtml(group.name)}</h3><span class="color-badge" style="background:${group.color}"></span></div><div class="card__body"><form id="settings-form" class="form"><div class="form-grid"><div class="field"><label>Nombre corto</label><input class="input" name="groupName" value="${escapeHtml(group.name)}"></div><div class="field"><label>Color identificador</label><input class="input color-input" name="color" type="color" value="${escapeHtml(group.color)}"></div></div><div class="field"><label>Empresa / encabezado WhatsApp</label><input class="input" name="companyName" value="${escapeHtml(group.companyName)}"></div><div class="form-grid"><div class="field"><label>Moneda principal</label><select class="select" name="currency"><option value="Bs." ${group.currency === "Bs." ? "selected" : ""}>Bolívares (Bs.)</option><option value="USD" ${group.currency === "USD" ? "selected" : ""}>Dólares (USD)</option></select></div><div class="field"><label>Comisión %</label><input class="input" name="commission" type="number" step=".01" value="${group.commission * 100}" data-zero-clear></div></div><div class="field"><label>Tasa Bs/USD</label><input class="input" name="exchangeRate" type="number" step=".0001" value="${group.exchangeRate}" data-zero-clear></div><label class="switch-row"><input type="checkbox" name="autoRate" ${group.autoRate ? "checked" : ""}><span><b>Aplicar automáticamente la última tasa guardada</b><small>No consulta servicios externos; funciona sin internet.</small></span></label><label class="switch-row"><input type="checkbox" name="showConversion" ${group.showConversion ? "checked" : ""}><span><b>Mostrar conversión Bs. ↔ USD</b><small>Editable y calculada con la tasa vigente.</small></span></label><div class="field"><label>Nombre para clientes</label><input class="input" name="clientLabel" value="${escapeHtml(group.clientLabel || "Participantes")}"></div><div class="field"><label>Pie WhatsApp de este grupo</label><textarea class="textarea" name="footerMessage" rows="8">${escapeHtml(group.footerMessage || "")}</textarea></div><div class="field"><label>Jugadas rápidas</label><input class="input" name="quickPlays" value="${escapeHtml(workspace.config.quickPlays.join(", "))}"></div><div class="field"><label>Montos rápidos</label><input class="input" name="quickAmounts" value="${escapeHtml(workspace.config.quickAmounts.join(", "))}"></div><div class="field"><label>Hipódromos favoritos</label><input class="input" name="recentRacetracks" value="${escapeHtml(workspace.config.recentRacetracks.join(", "))}"></div><div class="field"><label>Tema</label><select class="select" name="theme"><option value="system" ${workspace.config.theme === "system" ? "selected" : ""}>Seguir teléfono</option><option value="light" ${workspace.config.theme === "light" ? "selected" : ""}>Claro</option><option value="dark" ${workspace.config.theme === "dark" ? "selected" : ""}>Oscuro</option></select></div><button class="button button--primary">Guardar configuración</button>${groups.length > 1 ? `<button type="button" class="button button--danger" data-action="delete-group" data-id="${group.id}">Eliminar este grupo</button>` : ""}</form></div></section><section class="card"><div class="card__head"><h3>Continuidad y almacenamiento</h3><span class="badge ${storageInfo.persisted ? "badge--success" : "badge--warning"}">${storageInfo.persisted ? "Persistente" : "Administrado"}</span></div><div class="card__body"><div class="control-stack"><div><span>Motor local</span><strong>${storageInfo.engine}</strong></div><div><span>Uso estimado</span><strong>${bytesLabel(storageInfo.usage)}</strong></div><div><span>Cuota estimada</span><strong>${bytesLabel(storageInfo.quota)}</strong></div><div><span>Cola de nube</span><strong>${storageInfo.outbox}</strong></div><div><span>Copias locales</span><strong>${storageInfo.snapshots}</strong></div><div><span>Uso de cuota</span><strong>${percent.toFixed(2)}%</strong></div></div><div class="capture-actions section-gap"><button class="button" data-action="persist-storage">Proteger almacenamiento</button><button class="button" data-action="create-snapshot">Crear copia local</button><button class="button" data-action="restore-latest-snapshot">Restaurar última</button></div><div class="section-gap"><h3>Tasas de ${escapeHtml(group.name)}</h3><button class="button button--small" data-action="new-rate">Agregar tasa</button><div class="responsive-records section-gap-small">${groupItems(workspace.exchangeRates).sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<article><strong>${r.date}</strong><span>${number(r.rate)} Bs/USD</span></article>`).join("")}</div></div><div class="section-gap"><h3>Respaldo portátil</h3><div class="capture-actions"><button class="button" data-action="export-json">Guardar respaldo JSON</button><button class="button" data-action="import-json">Importar JSON</button><button class="button button--danger" data-action="reset-local">Borrar datos locales</button></div></div></div></section></div><section class="card section-gap"><div class="card__head"><div><h3>Backend y cuenta</h3><small>Supabase Auth + PostgreSQL + RLS</small></div><span class="badge ${backendStatus === "Conectado" ? "badge--success" : "badge--warning"}">${backendStatus}</span></div><div class="card__body"><div class="backend-grid"><div class="user-chip ${user.isAdmin ? "is-admin" : ""}"><strong>${escapeHtml(user.displayName)}</strong><small>${mode === "cloud" ? escapeHtml(user.email) : "Sin sesión de nube"}</small></div><div class="control-stack"><div><span>Rol</span><strong>${user.isAdmin ? "Administrador" : "Operador"}</strong></div><div><span>Workspace remoto</span><strong>${cloudWorkspaceId ? "Inicializado" : "Pendiente"}</strong></div><div><span>Versión remota</span><strong>${workspace.syncMeta.lastSyncedVersion || 0}</strong></div><div><span>Última sincronización</span><strong>${workspace.syncMeta.lastSyncedAt ? new Date(workspace.syncMeta.lastSyncedAt).toLocaleString("es-VE") : "Nunca"}</strong></div></div></div><div class="capture-actions section-gap">${mode === "cloud" ? `<button class="button button--primary" data-action="sync-now">Sincronizar ahora</button>` : `<button class="button" data-action="logout">Ir al acceso administrador</button>`}</div></div></section>`;
}
function renderModal() { if (!modal) return ""; if (modal.type === "race") return modalShell("Nueva carrera", raceForm()); if (modal.type === "participant") return modalShell(modal.id ? "Editar participante" : "Nuevo participante", participantForm(modal.id)); if (modal.type === "advanced") return modalShell("Nueva adelantada", advancedForm()); if (modal.type === "paste-advanced") return modalShell("Pegar lote de adelantadas", pasteAdvancedForm()); if (modal.type === "movement") return modalShell("Nuevo movimiento", movementForm()); if (modal.type === "rate") return modalShell("Nueva tasa", rateForm()); if (modal.type === "polla") return modalShell("Nueva POLLA", pollaForm()); if (modal.type === "polla-entry") return modalShell("Jugador de POLLA", pollaEntryForm()); if (modal.type === "group") return modalShell("Agregar grupo", groupForm()); if (modal.type === "tips") return modalShell("Guía rápida", `<div class="tip-list"><article><b>1</b><span>Selecciona el grupo correcto por su color.</span></article><article><b>2</b><span>Crea o abre una carrera.</span></article><article><b>3</b><span>Registra con la línea rápida y pulsa Enter.</span></article><article><b>4</b><span>Usa Guardar + copiar para WhatsApp.</span></article><article><b>5</b><span>Cierra recepción, coloca pizarra y procesa.</span></article><article><b>6</b><span>Genera PDF, Excel o cierre semanal.</span></article></div>`); if (modal.type === "logout") return modalShell("Cerrar sesión", `<div class="confirm-panel">${icon("logout")}<p>Se cerrará la sesión y al volver a abrir tendrás que iniciar sesión nuevamente.</p><div class="capture-actions"><button class="button" data-action="close-modal">Cancelar</button><button class="button button--danger" data-action="confirm-logout">Cerrar sesión</button></div></div>`); if (modal.type === "import") return modalShell("Importar respaldo", `<form id="import-form" class="form"><div class="field"><label>Archivo JSON</label><input class="input" name="file" type="file" accept="application/json,.json"></div><div class="field"><label>O pega aquí el respaldo</label><textarea class="textarea code-area" name="jsonText" rows="12" placeholder="{ ... }"></textarea></div><button class="button button--primary">Importar respaldo</button></form>`); if (modal.type === "backup-json") return modalShell("Respaldo JSON", `<div class="form"><p class="muted">En algunos teléfonos Android el navegador interno no permite descargar archivos. El respaldo ya quedó copiado y también puedes volver a intentar guardarlo o compartirlo.</p><div class="field"><label>${escapeHtml(backupJsonFilename || "respaldo.json")}</label><textarea class="textarea code-area" rows="12" readonly data-backup-json>${escapeHtml(backupJsonText)}</textarea></div><div class="capture-actions"><button type="button" class="button button--primary" data-action="retry-export-json">Guardar o compartir</button><button type="button" class="button" data-action="copy-backup-json">Copiar JSON</button></div></div>`); return ""; }
function modalShell(title, body) { return `<div class="modal-backdrop" data-action="close-modal"><section class="modal modern-modal" role="dialog" aria-modal="true" data-modal-dialog><div class="modal__handle"></div><div class="modal__head"><h3>${escapeHtml(title)}</h3><button class="button icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div><div class="modal__body">${body}</div></section></div>`; }
function trackOptions(selected = "") { const set = [...new Set([...workspace.config.recentRacetracks, ...workspace.config.racetrackCatalog])]; return set.map((x) => `<option value="${escapeHtml(x)}" ${x === selected ? "selected" : ""}>${escapeHtml(x)}</option>`).join(""); }
function raceForm() { const r = activeRace(); const date = activeDay()?.date || today(); const track = r?.racetrack || workspace.config.recentRacetracks[0] || "Colonial Downs"; const rate = activeGroup().autoRate ? workspaceRateForDate(date) : activeGroup().exchangeRate; return `<form id="race-form" class="form">${dateField("date", date)}<div class="field"><label>Hipódromo</label><select class="select track-select" name="racetrack" required>${trackOptions(track)}</select></div><div class="form-grid"><div class="field"><label>Carrera</label><input class="input" name="number" type="number" min="1" max="30" value="${Number(r?.number || 0) + 1 || 1}" required data-zero-clear></div><div class="field"><label>Tasa Bs/USD</label><input class="input" name="exchangeRate" type="number" step=".0001" value="${rate}" required data-zero-clear></div></div><div class="notice">Grupo: <b>${escapeHtml(activeGroup().companyName)}</b> · moneda ${escapeHtml(activeCurrency())}</div><button class="button button--primary">Crear y abrir</button></form>`; }
function participantForm(id) { const p = groupItems(workspace.participants).find((x) => x.id === id) || {}; return `<form id="participant-form" class="form"><input type="hidden" name="id" value="${p.id || ""}"><div class="form-grid"><div class="field"><label>Código</label><input class="input" name="code" value="${escapeHtml(p.code || "")}" required></div><div class="field"><label>Nombre</label><input class="input" name="name" value="${escapeHtml(p.name || "")}" required></div></div><div class="field"><label>Teléfono de WhatsApp</label><input class="input" name="phone" value="${escapeHtml(p.phone || "")}" inputmode="tel" placeholder="+58 412 0000000"><small>Permite reconocer automáticamente al remitente al pegar el chat.</small></div><div class="form-grid form-grid--three"><div class="field"><label>Saldo inicial ${escapeHtml(activeCurrency())}</label><input class="input" name="openingBalance" value="${p.id ? p.openingBalance ?? "" : ""}" placeholder="0" inputmode="decimal" data-zero-clear></div><div class="field"><label>Aval Bs</label><input class="input" name="avalBs" value="${p.id ? p.avalBs ?? "" : ""}" placeholder="0" inputmode="decimal" data-zero-clear></div><div class="field"><label>Aval USD</label><input class="input" name="avalUsd" value="${p.id ? p.avalUsd ?? "" : ""}" placeholder="0" inputmode="decimal" data-zero-clear></div></div><label class="switch-row"><input type="checkbox" name="pooled" ${p.pooled !== false ? "checked" : ""}><span><b>Controlar disponible</b><small>Incluye el participante en la matriz de riesgo.</small></span></label><label class="switch-row"><input type="checkbox" name="active" ${p.active !== false ? "checked" : ""}><span><b>Activo</b></span></label><button class="button button--primary">Guardar</button></form>`; }
function advancedForm() { return `<form id="advanced-form" class="form">${dateField("date", today())}<div class="field"><label>Hipódromo</label><select class="select" name="racetrack" required>${trackOptions(workspace.config.recentRacetracks[0])}</select></div><div class="field"><label>Carrera</label><input class="input" name="raceNumber" type="number" min="1" required data-zero-clear></div><div class="capture-core-v14"><div class="field"><label>Jugada</label><input class="input" name="play" value="1/2" required></div><div class="field"><label>Caballo</label><input class="input" name="horse" required></div><div class="field"><label>Monto</label><input class="input" name="amount" required inputmode="decimal" data-zero-clear></div>${participantInput("playerCode", "Juega", "", true)}${participantInput("receiverCode", "Consigue") }<div class="field"><label>Sin el</label><input class="input" name="without"></div></div><button class="button button--primary">Guardar adelantada</button></form>`; }
function pasteAdvancedForm() { return `<form id="paste-advanced-form" class="form"><div class="field"><label>Líneas</label><textarea class="textarea code-area" name="lines" rows="12" placeholder="2026-08-06 | Parx Racing | 4 | 1/2 | 5 | 12000 | cc | chivo | SIN="></textarea></div><button class="button button--primary">Importar lote</button></form>`; }
function movementForm() { return `<form id="movement-form" class="form"><div class="form-grid"><div class="field"><label>Tipo</label><select class="select" name="type"><option value="transfer">Transferencia</option><option value="pool">Pozo</option><option value="adjustment">Ajuste</option></select></div><div class="field"><label>Moneda</label><select class="select" name="currency"><option value="VES">Bolívares</option><option value="USD">Dólares</option></select></div></div><div class="field"><label>Participante</label><select class="select" name="participantId">${participantOptions()}</select></div><div class="field"><label>Destino de transferencia</label><select class="select" name="counterpartyId"><option value="">No aplica</option>${participantOptions()}</select></div><div class="field"><label>Monto</label><input class="input" name="amount" required inputmode="decimal" data-zero-clear></div><div class="field"><label>Nota</label><input class="input" name="note"></div><button class="button button--primary">Registrar</button></form>`; }
function rateForm() { return `<form id="rate-form" class="form">${dateField("date", today())}<div class="field"><label>Tasa Bs/USD</label><input class="input" name="rate" type="number" step=".0001" value="${activeGroup().exchangeRate}" required data-zero-clear></div><label class="switch-row"><input type="checkbox" name="applyNow" checked><span><b>Aplicar como tasa actual de ${escapeHtml(activeGroup().name)}</b></span></label><button class="button button--primary">Guardar tasa</button></form>`; }
function pollaForm() { return `<form id="polla-form" class="form"><div class="field"><label>Nombre</label><input class="input" name="name" value="Polla del día" required></div>${dateField("date", today())}<div class="field"><label>Hipódromo</label><select class="select" name="racetrack" required>${trackOptions(workspace.config.recentRacetracks[0])}</select></div><div class="form-grid"><div class="field"><label>Valor (${escapeHtml(activeCurrency())})</label><input class="input" name="ticketValue" placeholder="1000" required data-zero-clear></div><div class="field"><label>% a jugadores</label><input class="input" name="bettorsPercent" value="80" required data-zero-clear></div></div><button class="button button--primary">Crear</button></form>`; }
function pollaEntryForm() { return `<form id="polla-entry-form" class="form"><div class="field"><label>Participante</label><select class="select" name="participantId">${participantOptions()}</select></div><div class="field"><label>Seis selecciones separadas por coma</label><input class="input" name="picks" placeholder="3, 5, 8, 2, 7, 1" required></div><button class="button button--primary">Agregar</button></form>`; }
function groupForm() { return `<form id="group-form" class="form"><div class="form-grid"><div class="field"><label>Nombre corto</label><input class="input" name="name" placeholder="Grupo Norte" required></div><div class="field"><label>Color</label><input class="input color-input" name="color" type="color" value="#c28b6e"></div></div><div class="field"><label>Empresa / encabezado</label><input class="input" name="companyName" placeholder="CÍRCULO HÍPICO NORTE" required></div><div class="field"><label>Moneda</label><select class="select" name="currency"><option value="Bs.">Bolívares</option><option value="USD">Dólares</option></select></div><div class="field"><label>Tasa Bs/USD</label><input class="input" name="exchangeRate" value="${activeGroup().exchangeRate}" data-zero-clear></div><button class="button button--primary">Crear grupo independiente</button></form>`; }
root.addEventListener("click", async (event) => {
    var _a, _b;
    const dialog = event.target.closest("[data-modal-dialog]");
    if (dialog && !event.target.closest("[data-modal-dialog] [data-action]")) return;
    const el = event.target.closest("[data-action],[data-view],[data-tab],[data-report-tab]");
    if (!el)
        return;
    try {
        if (el.dataset.view) { navigateTo(el.dataset.view); return; }
        if (el.dataset.tab) {
            raceTab = el.dataset.tab;
            render();
            return;
        }
        if (el.dataset.reportTab) {
            reportTab = el.dataset.reportTab;
            render();
            return;
        }
        const action = el.dataset.action;
        if (action === "refresh-shadow-feed") {
            await refreshShadowFeed(false);
            return;
        }
        if (action === "logout") { modal = { type: "logout" }; render(); return; }
        if (action === "confirm-logout") {
            await flushWorkspaceWrites().catch(() => {}); mode = null; cloudProfile = null; cloudWorkspaceId = null; navigationHistory = [];
            await setAppMode(null); await signOut().catch(() => {}); workspace = null; modal = null; render(); toast("Sesión cerrada. Se solicitará acceso al abrir nuevamente.", "success"); return;
        }
        if (action === "go-home") { navigateTo("dashboard"); return; }
        if (action === "go-back") { goBack(); return; }
        if (action === "toggle-theme") { workspace.config.theme = workspace.config.theme === "dark" ? "light" : "dark"; persist(); render(); return; }
        if (action === "show-tips") { modal = { type: "tips" }; render(); return; }
        if (action === "new-group") { modal = { type: "group" }; render(); return; }
        if (action === "toggle-capture-group") {
            const id = el.dataset.id; const y = scrollTopValue(); const selected = new Set(selectedCaptureGroupIds());
            if (id === activeGroupId() && selected.has(id) && selected.size === 1) throw new Error("Debe quedar al menos un grupo seleccionado.");
            selected.has(id) ? selected.delete(id) : selected.add(id);
            if (!selected.size) selected.add(activeGroupId());
            workspace.config.captureGroupIds = [...selected]; persist(); render(); restoreScroll(y); return;
        }
        if (action === "copy-risk-text") { await copyText(riskText(activeRace()), "Matriz de riesgo copiada como texto."); return; }
        if (action === "copy-metrics") { await copyText(metricsText(), "Métricas multigrupo copiadas."); return; }
        if (action === "select-group") {
            const id = el.dataset.id; const y = scrollTopValue(); if (!groupList().some((group) => group.id === id)) return;
            workspace.config.activeGroupId = id; workspace.config.activeWhatsappGroupId = id; workspace.activeRaceId = workspace.config.activeRaceByGroup?.[id] || null;
            workspace.config.captureGroupIds = [...new Set([id, ...(workspace.config.captureGroupIds || []).filter((groupId) => groupId !== id)])];
            persist(); render(); restoreScroll(y); toast(`Grupo activo: ${activeGroup().name}`, "success"); return;
        }
        if (action === "delete-group") {
            if (groupList().length <= 1) throw new Error("Debe existir al menos un grupo.");
            const id = el.dataset.id; const used = [workspace.participants, workspace.races, workspace.movements].some((items) => groupItems(items, id).length);
            if (used && !confirm("Este grupo contiene datos. ¿Eliminarlo junto con sus registros?")) return;
            workspace.config.groups = groupList().filter((group) => group.id !== id); workspace.config.whatsappGroups = workspace.config.groups;
            for (const key of ["participants","days","races","advancedBets","movements","exchangeRates","weekClosures","pollas","audit"]) workspace[key] = (workspace[key] || []).filter((item) => item.groupId !== id);
            workspace.config.activeGroupId = workspace.config.groups[0].id; workspace.config.activeWhatsappGroupId = workspace.config.activeGroupId; setActiveRaceId(null); persist(); render(); return;
        }
        if (action === "install-app" && installPrompt) {
            await installPrompt.prompt();
            installPrompt = null;
            render();
            return;
        }
        if (action === "close-modal") {
            modal = null;
            render();
            return;
        }
        if (action === "new-race") {
            modal = { type: "race" };
            render();
            return;
        }
        if (action === "new-participant") {
            modal = { type: "participant" };
            render();
            return;
        }
        if (action === "edit-participant") {
            modal = { type: "participant", id: el.dataset.id };
            render();
            return;
        }
        if (action === "new-advanced") {
            modal = { type: "advanced" };
            render();
            return;
        }
        if (action === "paste-advanced") {
            modal = { type: "paste-advanced" };
            render();
            return;
        }
        if (action === "new-movement") {
            modal = { type: "movement" };
            render();
            return;
        }
        if (action === "new-rate") {
            modal = { type: "rate" };
            render();
            return;
        }
        if (action === "new-polla") {
            modal = { type: "polla" };
            render();
            return;
        }
        if (action === "new-polla-entry") {
            modal = { type: "polla-entry" };
            render();
            return;
        }
        if (action === "save-polla-results") {
            (_b = root.querySelector("#polla-results-form")) === null || _b === void 0 ? void 0 : _b.requestSubmit();
            return;
        }
        if (action === "import-json") {
            modal = { type: "import" };
            render();
            return;
        }
        if (action === "focus-fast") {
            view = "race";
            raceTab = "capture";
            queueFocus('[data-fast-input]');
            render();
            return;
        }
        if (action === "select-race") { setActiveRaceId(el.dataset.id); raceTab = "capture"; persist(); navigateTo("race"); return; }
        if (action === "prev-race" || action === "next-race") {
            const list = groupItems(workspace.races).filter((r) => r.dayId === activeDay()?.id);
            let i = list.findIndex((r) => r.id === workspace.activeRaceId);
            i = action === "next-race" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
            if (list[i])
                setActiveRaceId(list[i].id);
            persist();
            render();
            return;
        }
        if (action === "set-field") {
            const input = root.querySelector(`#bet-form [name="${el.dataset.field}"]`); if (!input) return;
            const y = scrollTopValue(); input.value = el.dataset.value; input.dispatchEvent(new Event("input", { bubbles: true }));
            el.closest(".chip-row")?.querySelectorAll(".quick-chip").forEach((chip) => chip.classList.toggle("is-selected", chip === el));
            restoreScroll(y); return;
        }
        if (action === "choose-participant") {
            const input = root.querySelector(`[name="${el.dataset.field}"]`); if (input) { input.value = el.dataset.value; input.closest(".field")?.querySelector("[data-suggestion-menu]")?.classList.remove("is-open"); input.blur(); }
            return;
        }
        if (action === "open-date-picker") {
            const input = root.querySelector(`[name="${el.dataset.field}"]`); const value = input?.value || today(); calendarPicker = { field: el.dataset.field, value, cursor: `${value.slice(0,7)}-01` }; root.insertAdjacentHTML("beforeend", renderCalendarOverlay()); return;
        }
        if (["calendar-prev","calendar-next"].includes(action)) { const d = new Date(`${calendarPicker.cursor}T12:00:00`); d.setMonth(d.getMonth() + (action === "calendar-next" ? 1 : -1)); calendarPicker.cursor = d.toISOString().slice(0,10); document.querySelector("[data-calendar-overlay]")?.remove(); root.insertAdjacentHTML("beforeend", renderCalendarOverlay()); return; }
        if (action === "calendar-today") { el.dataset.value = today(); }
        if (action === "select-date" || action === "calendar-today") {
            const value = action === "calendar-today" ? today() : el.dataset.value; const input = root.querySelector(`[name="${calendarPicker.field}"]`); if (input) input.value = value;
            const label = root.querySelector(`[data-date-label="${calendarPicker.field}"]`); if (label) label.textContent = dateLabel(value); calendarPicker = null; document.querySelector("[data-calendar-overlay]")?.remove(); return;
        }
        if (action === "close-calendar") { calendarPicker = null; document.querySelector("[data-calendar-overlay]")?.remove(); return; }
        if (action === "paste-chat") {
            const text = await navigator.clipboard.readText();
            const area = root.querySelector('#whatsapp-parse-form [name="chat"]');
            if (area) area.value = text;
            chatDraft = text;
            toast("Mensajes pegados. Pulsa Analizar mensajes.", "success");
            return;
        }
        if (action === "clear-chat-analysis") {
            chatDraft = "";
            chatAnalysis = null;
            chatApprovedMatchIds = new Set();
            render();
            return;
        }
        if (action === "copy-closure") {
            await copyText(generateClosureText(activeCompany(), "AMERICANAS"), "Mensaje de cierre copiado.");
            return;
        }
        if (action === "toggle-chat-match-approval") {
            const id = String(el.dataset.id || "");
            if (chatApprovedMatchIds.has(id)) chatApprovedMatchIds.delete(id);
            else chatApprovedMatchIds.add(id);
            render();
            return;
        }
        if (action === "import-chat-matches") {
            importChatMatches();
            render();
            return;
        }
        if (action === "apply-chat-board") {
            applyLatestChatBoard();
            render();
            return;
        }
        if (action === "lock-race") {
            const r = activeRace();
            mutate("race_locked", "race", r.id, "Se cerró la recepción.", () => r.status = "locked");
            return;
        }
        if (action === "unlock-race") {
            const r = activeRace();
            mutate("race_unlocked", "race", r.id, "Se reabrió la recepción.", () => r.status = "open");
            return;
        }
        if (action === "copy-bet" || action === "whatsapp-bet") {
            const r = activeRace();
            const b = r.bets.find((x) => x.id === el.dataset.id);
            const text = generateBetReceiptText(workspace, r, b);
            const groupId = workspace.config.activeWhatsappGroupId;
            b.messageStatus = action === "copy-bet" ? "copied" : "opened";
            b.messageStatusByGroup || (b.messageStatusByGroup = {});
            b.messageStatusByGroup[groupId] = b.messageStatus;
            persist();
            if (action === "copy-bet")
                await copyText(text);
            else
                await openWhatsApp(text);
            render();
            return;
        }
        if (action === "duplicate-bet") {
            const r = activeRace(), b = r.bets.find((x) => x.id === el.dataset.id);
            if (r.status !== "open")
                throw new Error("La recepción está cerrada.");
            const copy = Object.assign(Object.assign({}, b), { id: uid("bet"), status: "pending", settlement: null, messageStatus: "pending", createdAt: now(), updatedAt: now() });
            mutate("bet_duplicated", "bet", copy.id, "Se duplicó una apuesta.", () => r.bets.push(copy));
            queueFocus('[data-fast-input]');
            return;
        }
        if (action === "cancel-bet") {
            const r = activeRace(), b = r.bets.find((x) => x.id === el.dataset.id);
            mutate("bet_cancelled", "bet", b.id, "Se anuló una apuesta.", () => { b.status = "cancelled"; b.cancelledAt = now(); });
            return;
        }
        if (action === "use-available") {
            useAvailableFromForm();
            return;
        }
        if (action === "settle-race") {
            settleRace();
            return;
        }
        if (action === "reopen-settlement") {
            const r = activeRace();
            mutate("settlement_reopened", "race", r.id, "Se reabrió la liquidación.", () => { r.bets.forEach((b) => { if (b.status === "settled") {
                b.status = "pending";
                b.settlement = null;
            } }); r.status = "locked"; r.settledAt = null; });
            return;
        }
        if (action === "close-race") {
            const r = activeRace();
            mutate("race_closed", "race", r.id, "Se finalizó la carrera.", () => { r.status = "closed"; r.closedAt = now(); });
            return;
        }
        if (action === "copy-plan" || action === "whatsapp-plan" || action === "share-plan") {
            const text = generateWhatsappText(workspace, activeRace());
            if (action === "copy-plan")
                await copyText(text);
            else if (action === "whatsapp-plan")
                await openWhatsApp(text);
            else
                await shareText("Plano hípico", text);
            return;
        }
        if (action === "print") {
            window.print();
            return;
        }
        if (action === "export-race") {
            exportRace();
            return;
        }
        if (action === "export-risk") {
            exportRisk();
            return;
        }
        if (action === "load-advanced-group") {
            loadAdvancedGroup(el.dataset.key);
            return;
        }
        if (action === "clear-advanced-group") {
            const key = el.dataset.key;
            mutate("advanced_group_cleared", "advanced", key, "Se borró un lote adelantado.", () => workspace.advancedBets = workspace.advancedBets.filter((b) => b.groupId !== activeGroupId() || `${b.date}|${b.racetrack}|${b.raceNumber}` !== key));
            return;
        }
        if (action === "delete-advanced") {
            mutate("advanced_deleted", "advanced", el.dataset.id, "Se eliminó una adelantada.", () => workspace.advancedBets = workspace.advancedBets.filter((b) => b.id !== el.dataset.id));
            return;
        }
        if (action === "copy-balances" || action === "whatsapp-balances") {
            const text = generateBalancesWhatsappText(workspace, currentBalanceRows());
            if (action === "copy-balances")
                await copyText(text);
            else
                await openWhatsApp(text);
            return;
        }
        if (action === "copy-daily") {
            await copyText(generateDailySummaryText(workspace, activeDay(), dayStats()));
            return;
        }
        if (action === "close-day") {
            closeDay();
            return;
        }
        if (action === "close-week") {
            closeWeek();
            return;
        }
        if (action === "history-this-week") {
            const d = new Date();
            const day = d.getDay() || 7;
            const start = new Date(d);
            start.setDate(d.getDate() - day + 1);
            historyFilter.from = start.toISOString().slice(0, 10);
            historyFilter.to = today();
            view = "history";
            render();
            return;
        }
        if (action === "export-history") {
            exportHistory();
            return;
        }
        if (action === "export-balances") {
            exportBalances();
            return;
        }
        if (action === "export-json") {
            await exportJsonBackup();
            return;
        }
        if (action === "retry-export-json") {
            if (!backupJsonText) await prepareJsonBackup();
            const result = await deliverJsonBackup(backupJsonFilename, backupJsonText);
            if (result.ok) {
                modal = null;
                render();
                toast(result.method === "share" ? "Respaldo listo para guardar o compartir." : "Respaldo JSON guardado.", "success", { duration: 5000 });
            } else if (result.method !== "cancelled") {
                await copyText(backupJsonText, "Respaldo copiado. Guárdalo en Notas, Drive o WhatsApp.");
            }
            return;
        }
        if (action === "copy-backup-json") {
            if (!backupJsonText) await prepareJsonBackup();
            await copyText(backupJsonText, "Respaldo JSON copiado.");
            return;
        }
        if (action === "export-daily-pdf") {
            exportDailyPdf();
            return;
        }
        if (action === "export-daily-xlsx") {
            exportDailyXlsx();
            return;
        }
        if (action === "export-weekly-pdf") {
            exportWeeklyPdf();
            return;
        }
        if (action === "export-weekly-xlsx") {
            exportWeeklyXlsx();
            return;
        }
        if (action === "export-balances-pdf") {
            exportBalancesPdf();
            return;
        }
        if (action === "export-balances-xlsx") {
            exportBalancesXlsx();
            return;
        }
        if (action === "sync-now") {
            if (mode !== "cloud" || !currentSession())
                throw new Error("Inicia sesión con la cuenta administradora.");
            scheduleCloudSync();
            toast("Sincronización iniciada.", "success");
            return;
        }
        if (action === "create-snapshot") {
            await createSnapshot(workspace, "manual");
            await refreshStorageInfo();
            render();
            toast("Copia local creada en IndexedDB.", "success");
            return;
        }
        if (action === "persist-storage") {
            const granted = await requestPersistentStorage();
            await refreshStorageInfo();
            render();
            toast(granted ? "El sistema solicitó conservar los datos locales." : "El navegador no garantizó almacenamiento persistente.", granted ? "success" : "info");
            return;
        }
        if (action === "set-whatsapp-group") { workspace.config.activeGroupId = el.dataset.id; workspace.config.activeWhatsappGroupId = el.dataset.id; workspace.activeRaceId = workspace.config.activeRaceByGroup?.[el.dataset.id] || null; persist(); render(); return; }
        if (action === "restore-latest-snapshot") {
            const snapshots = await listSnapshots();
            if (!snapshots.length)
                throw new Error("Todavía no hay copias locales.");
            if (confirm(`¿Restaurar la copia del ${new Date(snapshots[0].createdAt).toLocaleString("es-VE")}?`)) {
                workspace = normalizeWorkspaceShape(await restoreSnapshot(snapshots[0].id));
                await refreshStorageInfo();
                render();
                toast("Copia restaurada.", "success");
            }
            return;
        }
        if (action === "reset-local") {
            if (confirm("¿Borrar todos los datos de este dispositivo?")) {
                await createSnapshot(workspace, "antes-de-borrar");
                await clearLocalWorkspace();
                workspace = normalizeWorkspaceShape(createBlankWorkspace());
                await saveLocalWorkspace(workspace);
                await refreshStorageInfo();
                render();
            }
            return;
        }
    }
    catch (error) {
        toast(error.message, "error");
    }
}
);
root.addEventListener("submit", async (event) => {
    var _a, _b, _c;
    event.preventDefault();
    const form = event.target;
    // HTMLFormElement exposes named controls as properties. The participant
    // form has an input named "id", so form.id can be the input element
    // instead of the form's identifier. Always read the actual attribute.
    const formId = form.getAttribute("id");
    const data = new FormData(form);
    try {
        if (formId === "auth-form") {
            const action = (_a = event.submitter) === null || _a === void 0 ? void 0 : _a.value;
            const email = String(data.get("email") || "").trim();
            const password = String(data.get("password") || "");
            const enterLocal = async (message = "Acceso local administrador activado.") => {
                if (!(await verifyLocalAdmin(email, password)))
                    throw new Error("Credenciales locales incorrectas.");
                mode = "local";
                cloudProfile = null;
                cloudWorkspaceId = null;
                await setAppMode(mode);
                workspace = normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
                await refreshStorageInfo();
                render();
                toast(message, "success", { duration: 5000 });
            };
            if (action === "local") {
                if (!(await hasLocalAdminEnrollment()))
                    throw new Error("Activa una vez el acceso sin conexión iniciando sesión con internet en este dispositivo.");
                await enterLocal();
                return;
            }
            if (action === "signup" && !CLOUD_CONFIG.allowSignup)
                throw new Error("El registro público está desactivado.");
            let session = null;
            try {
                session = action === "signup" ? await signUp(email, password) : await signIn(email, password);
            }
            catch (cloudError) {
                if ((await hasLocalAdminEnrollment()) && await verifyLocalAdmin(email, password)) {
                    await enterLocal("No se pudo conectar a la nube. Se abrió la continuidad sin conexión.");
                    return;
                }
                throw cloudError;
            }
            if (!(session === null || session === void 0 ? void 0 : session.access_token))
                throw new Error("Revisa el correo para confirmar la cuenta.");
            let cloudAccess = null;
            try {
                cloudAccess = await fetchCloudAccess();
            }
            catch (accessError) {
                const localReady = isTransientCloudError(accessError)
                    && (await hasLocalAdminEnrollment())
                    && await verifyLocalAdmin(email, password);
                if (localReady) {
                    await signOut().catch(() => { });
                    await enterLocal("La identidad fue validada, pero la autorización remota no respondió. Se abrió la continuidad local ya enrolada.");
                    return;
                }
                await signOut().catch(() => { });
                if (isTransientCloudError(accessError))
                    throw new Error("Tu identidad fue validada, pero Control Hípico no pudo confirmar los permisos. Reintenta; si este dispositivo ya estaba habilitado, usa Entrar sin conexión.");
                throw accessError;
            }
            if (!cloudAccess) {
                await clearLocalAdminEnrollment().catch(() => { });
                await signOut().catch(() => { });
                throw new Error("Tu identidad es válida, pero todavía no tiene acceso a Control Hípico.");
            }
            if (cloudAccess.status !== "active") {
                await clearLocalAdminEnrollment().catch(() => { });
                await signOut().catch(() => { });
                throw new Error(cloudAccess.status === "suspended"
                    ? "Tu acceso a Control Hípico está suspendido."
                    : "Tu acceso a Control Hípico está deshabilitado.");
            }
            cloudProfile = {
                display_name: cloudAccess.display_name || email,
                role: cloudAccess.role || "operator"
            };
            await enrollLocalAdmin(email, password).catch((error) => console.warn("No se pudo habilitar el acceso sin conexión:", error));
            mode = "cloud";
            await setAppMode(mode);
            workspace = normalizeWorkspaceShape(await loadLocalWorkspace(createBlankWorkspace));
            await refreshStorageInfo();
            render();
            init().catch((error) => { var _a; console.error("No se pudo completar la hidratación de Hípico Control:", error); (_a = globalThis.__HIPICO_BOOT_FAIL__) === null || _a === void 0 ? void 0 : _a.call(globalThis, error); });
            return;
        }
        if (formId === "race-form") {
            const day = activeDay();
            const race = { id: uid("race"), groupId: activeGroupId(), dayId: day.id, date: String(data.get("date")), racetrack: String(data.get("racetrack")).trim(), number: Number(data.get("number")), exchangeRate: Number(data.get("exchangeRate")), status: "open", retired: [], board: ["", "", "", "", "", ""], boardPositions: [1, 2, 3, 4, 5, 6], bets: [], settledAt: null, closedAt: null, createdAt: now(), updatedAt: now() };
            mutate("race_created", "race", race.id, `Se creó ${race.racetrack} ${race.number}ª.`, () => { workspace.races.push(race); setActiveRaceId(race.id); workspace.config.recentRacetracks = [race.racetrack, ...workspace.config.recentRacetracks.filter((x) => x !== race.racetrack)].slice(0, 8); activeGroup().exchangeRate = race.exchangeRate; modal = null; view = "race"; raceTab = "capture"; });
            return;
        }
        if (formId === "whatsapp-parse-form") {
            chatDraft = String(data.get("chat") || "").trim();
            if (!chatDraft) throw new Error("Pega primero los mensajes del chat.");
            chatApprovedMatchIds = new Set();
            chatAnalysis = parseWhatsAppChat(chatDraft, { racetrackCatalog: workspace.config.racetrackCatalog || [] });
            render();
            toast(`${chatAnalysis.stats.messages} mensajes · ${chatAnalysis.stats.replies} respuestas citadas · ${chatAnalysis.stats.matches} pareja(s).`, "success", { duration: 5500 });
            return;
        }
        if (formId === "participant-form") {
            const id = data.get("id"), code = String(data.get("code")).trim().toLowerCase();
            if (groupItems(workspace.participants).some((p) => p.code.toLowerCase() === code && p.id !== id))
                throw new Error("Ese código ya existe.");
            const values = { groupId: activeGroupId(), code, name: String(data.get("name")).trim(), phone: String(data.get("phone") || "").trim(), openingBalance: parseAmount(data.get("openingBalance")), avalBs: parseAmount(data.get("avalBs")), avalUsd: parseAmount(data.get("avalUsd")), pooled: data.get("pooled") === "on", active: data.get("active") === "on", updatedAt: now() };
            if (id) {
                const p = groupItems(workspace.participants).find((x) => x.id === id);
                mutate("participant_updated", "participant", id, `Se actualizó ${code}.`, () => { Object.assign(p, values); modal = null; });
                toast(`Participante ${code} guardado.`, "success");
            }
            else {
                const p = Object.assign(Object.assign({ id: uid("p") }, values), { previousWeekBalance: values.openingBalance });
                mutate("participant_created", "participant", p.id, `Se creó ${code}.`, () => { workspace.participants.push(p); modal = null; });
                toast(`Participante ${code} guardado.`, "success");
            }
            return;
        }
        if (formId === "quick-bet-form") {
            const parsed = parseQuickBet(data.get("quick"), groupParticipants());
            await addBet(parsed, ((_b = event.submitter) === null || _b === void 0 ? void 0 : _b.value) || "plain");
            form.reset();
            queueFocus('[data-fast-input]');
            return;
        }
        if (formId === "bet-form") {
            const player = participantByCode(data.get("playerCode"), true), receiver = participantByCode(data.get("receiverCode"));
            await addBet({ play: String(data.get("play")).trim().toUpperCase(), horse: String(data.get("horse")).trim().replace(/x/gi, "*"), amount: parseAmount(data.get("amount")), playerId: player.id, receiverId: (receiver === null || receiver === void 0 ? void 0 : receiver.id) || "", without: String(data.get("without") || "").trim() }, ((_c = event.submitter) === null || _c === void 0 ? void 0 : _c.value) || "plain");
            form.querySelector('[name="amount"]').value = "";
            form.querySelector('[name="playerCode"]').value = "";
            queueFocus('#bet-form [name="amount"]');
            return;
        }
        if (formId === "board-form") {
            const r = activeRace();
            mutate("board_updated", "race", r.id, "Se actualizó la pizarra.", () => { r.board = Array.from({ length: 6 }, (_, i) => String(data.get(`horse${i}`) || "").trim()); r.boardPositions = Array.from({ length: 6 }, (_, i) => Number(data.get(`position${i}`) || i + 1)); r.retired = String(data.get("retired") || "").split(",").map((x) => x.trim()).filter(Boolean); r.updatedAt = now(); });
            toast("Pizarra guardada.", "success");
            return;
        }
        if (formId === "advanced-form") {
            const player = participantByCode(data.get("playerCode"), true), receiver = participantByCode(data.get("receiverCode"));
            const b = { id: uid("adv"), groupId: activeGroupId(), date: String(data.get("date")), racetrack: String(data.get("racetrack")).trim(), raceNumber: Number(data.get("raceNumber")), play: String(data.get("play")).toUpperCase(), horse: String(data.get("horse")).replace(/x/gi, "*"), amount: parseAmount(data.get("amount")), playerId: player.id, receiverId: (receiver === null || receiver === void 0 ? void 0 : receiver.id) || "", without: String(data.get("without") || ""), status: "staged", createdAt: now() };
            mutate("advanced_created", "advanced", b.id, "Se guardó una apuesta adelantada.", () => { workspace.advancedBets.push(b); modal = null; });
            return;
        }
        if (formId === "paste-advanced-form") {
            const parsed = parseAdvancedLines(String(data.get("lines")));
            mutate("advanced_imported", "advanced", "batch", `Se importaron ${parsed.length} adelantadas.`, () => { workspace.advancedBets.push(...parsed); modal = null; });
            return;
        }
        if (formId === "movement-form") {
            const type = String(data.get("type")), participantId = String(data.get("participantId")), counterpartyId = String(data.get("counterpartyId") || ""), currency = String(data.get("currency")), raw = String(data.get("amount")), amount = raw.trim().startsWith("-") ? -parseAmount(raw) : parseAmount(raw);
            if (!amount)
                throw new Error("Monto inválido.");
            if (type === "transfer" && (!counterpartyId || counterpartyId === participantId))
                throw new Error("Selecciona un destino diferente.");
            const m = { id: uid("mov"), groupId: activeGroupId(), dayId: activeDay().id, date: activeDay().date, type, participantId, counterpartyId: type === "transfer" ? counterpartyId : "", currency, amount, note: String(data.get("note") || ""), status: "posted", createdAt: now() };
            mutate("movement_posted", "movement", m.id, "Se registró un movimiento.", () => { workspace.movements.push(m); modal = null; });
            return;
        }
        if (formId === "history-filter-form") {
            historyFilter = Object.fromEntries(data.entries());
            render();
            return;
        }
                if (formId === "settings-form") {
            const group = activeGroup(); const rate = Number(data.get("exchangeRate"));
            mutate("settings_updated", "workspace", group.id, "Se actualizó la configuración del grupo.", () => {
                group.name = String(data.get("groupName") || group.name).trim(); group.companyName = String(data.get("companyName") || group.companyName).trim(); group.color = String(data.get("color") || group.color);
                group.currency = String(data.get("currency") || "Bs."); group.commission = Number(data.get("commission")) / 100; group.exchangeRate = rate; group.autoRate = data.get("autoRate") === "on"; group.showConversion = data.get("showConversion") === "on"; group.clientLabel = String(data.get("clientLabel") || "Participantes"); group.footerMessage = String(data.get("footerMessage") || "");
                workspace.config.theme = String(data.get("theme") || "system"); workspace.config.quickPlays = String(data.get("quickPlays")).split(",").map((x) => x.trim().toUpperCase()).filter(Boolean); workspace.config.quickAmounts = String(data.get("quickAmounts")).split(",").map(parseAmount).filter(Boolean); workspace.config.recentRacetracks = String(data.get("recentRacetracks")).split(",").map((x) => x.trim()).filter(Boolean);
                workspace.config.groups = groupList(); workspace.config.whatsappGroups = workspace.config.groups; workspace.config.activeWhatsappGroupId = workspace.config.activeGroupId;
                if (group.id === groupList()[0].id) { workspace.config.clubName = group.companyName; workspace.config.currency = group.currency; workspace.config.commission = group.commission; workspace.config.exchangeRate = group.exchangeRate; workspace.config.footerMessage = group.footerMessage; }
            }); toast("Configuración del grupo guardada.", "success"); return;
        }
        if (formId === "group-form") {
            const id = uid("group"); const group = { id, name: String(data.get("name")).trim(), companyName: String(data.get("companyName")).trim(), color: String(data.get("color") || "#c28b6e"), currency: String(data.get("currency") || "Bs."), exchangeRate: Number(data.get("exchangeRate") || activeGroup().exchangeRate), commission: .05, showConversion: true, autoRate: true, clientLabel: "Participantes", footerMessage: "*CONTROL REFERENCIAL*\n*_La confirmación válida es el chat_*\n*RECLAMOS AL PRIVADO*" };
            mutate("group_created", "group", id, `Se creó el grupo ${group.name}.`, () => { workspace.config.groups.push(group); workspace.config.whatsappGroups = workspace.config.groups; workspace.config.activeGroupId = id; workspace.config.activeWhatsappGroupId = id; workspace.config.activeRaceByGroup[id] = null; workspace.days.push({ id: uid("day"), groupId: id, date: today(), status: "open", closure: null }); workspace.exchangeRates.push({ id: uid("rate"), groupId: id, date: today(), rate: group.exchangeRate }); modal = null; view = "dashboard"; }); return;
        }
if (formId === "rate-form") {
            const date = String(data.get("date")), rate = Number(data.get("rate"));
            mutate("rate_added", "rate", date, "Se guardó una tasa histórica.", () => { workspace.exchangeRates = workspace.exchangeRates.filter((r) => r.groupId !== activeGroupId() || r.date !== date); workspace.exchangeRates.push({ id: uid("rate"), groupId: activeGroupId(), date, rate }); if (data.get("applyNow") === "on") activeGroup().exchangeRate = rate; if (activeGroupId() === groupList()[0].id) workspace.config.exchangeRate = rate; modal = null; });
            return;
        }
        if (formId === "polla-form") {
            const p = { id: uid("polla"), groupId: activeGroupId(), name: String(data.get("name")), date: String(data.get("date")), racetrack: String(data.get("racetrack")), ticketValue: parseAmount(data.get("ticketValue")), bettorsPercent: Number(data.get("bettorsPercent")) / 100, validResults: Array.from({ length: 6 }, (_, i) => ({ raceNumber: i + 1, first: [], second: [], third: [] })), entries: [], status: "open", createdAt: now() };
            mutate("polla_created", "polla", p.id, "Se creó una POLLA.", () => { workspace.pollas = [p, ...workspace.pollas]; modal = null; view = "polla"; });
            return;
        }
        if (formId === "polla-entry-form") {
            const p = groupItems(workspace.pollas)[0];
            const entry = { id: uid("entry"), participantId: String(data.get("participantId")), picks: String(data.get("picks")).split(",").map((x) => x.trim()).slice(0, 6) };
            if (entry.picks.length !== 6)
                throw new Error("Debe ingresar seis selecciones.");
            mutate("polla_entry_added", "polla", p.id, "Se agregó un jugador a la POLLA.", () => { p.entries.push(entry); modal = null; });
            return;
        }
        if (formId === "polla-results-form") {
            const p = groupItems(workspace.pollas)[0];
            mutate("polla_updated", "polla", p.id, "Se actualizaron los resultados de la POLLA.", () => { p.validResults = Array.from({ length: 6 }, (_, i) => ({ raceNumber: i + 1, first: splitList(data.get(`first${i}`)), second: splitList(data.get(`second${i}`)), third: splitList(data.get(`third${i}`)) })); });
            return;
        }
        if (formId === "import-form") {
            const file = data.get("file");
            const pasted = String(data.get("jsonText") || "").trim();
            const raw = file && Number(file.size || 0) > 0 ? await file.text() : pasted;
            if (!raw) throw new Error("Selecciona un archivo JSON o pega el contenido del respaldo.");
            const parsed = JSON.parse(raw);
            await createSnapshot(workspace, "antes-de-importar");
            workspace = normalizeWorkspaceShape(parsed);
            await saveLocalWorkspace(workspace);
            modal = null;
            await refreshStorageInfo();
            render();
            toast("Respaldo importado.", "success");
            return;
        }
    }
    catch (error) {
        toast(error.message, "error");
    }
});
function splitList(value) { return String(value || "").split(",").map((x) => x.trim()).filter(Boolean); }


function ensureChatParticipant(sender, phone = "") {
    let participant = chatParticipant(sender, phone);
    if (participant) return participant;
    let code = senderCode(sender, phone).toLowerCase();
    const base = code;
    let suffix = 2;
    while (groupItems(workspace.participants).some((item) => String(item.code).toLowerCase() === code)) code = `${base}${suffix++}`;
    participant = { id: uid("p"), groupId: activeGroupId(), code, name: String(sender || code).trim(), phone: String(phone || "").trim(), openingBalance: 0, avalBs: 0, avalUsd: 0, pooled: true, previousWeekBalance: 0, active: true, createdAt: now(), updatedAt: now(), source: "whatsapp" };
    workspace.participants.push(participant);
    return participant;
}
function importChatMatches() {
    const race = activeRace();
    if (!race || race.status !== "open") throw new Error("Abre una carrera antes de importar el chat.");
    if (!chatAnalysis?.matches?.length) throw new Error("No hay parejas detectadas.");
    workspace.chatImports ||= [];
    const imported = new Set(workspace.chatImports);
    const compatible = chatAnalysis.matches.filter((match) => !imported.has(match.id) && (!match.track || sameTrack(match.track, race.racetrack)));
    const eligible = compatible.filter((match) => !match.requiresApproval || chatApprovedMatchIds.has(match.id));
    if (!eligible.length) {
        if (compatible.some((match) => match.requiresApproval && !chatApprovedMatchIds.has(match.id))) throw new Error("Hay parejas que requieren pulsar Validar antes de importarlas.");
        throw new Error("No hay parejas nuevas compatibles con la carrera activa.");
    }
    let created = 0;
    mutate("whatsapp_imported", "race", race.id, `Se importaron ${eligible.length} parejas desde WhatsApp.`, () => {
        for (const match of eligible) {
            const player = ensureChatParticipant(match.player, match.playerPhone);
            const receiver = ensureChatParticipant(match.receiver, match.receiverPhone);
            const bet = { id: uid("bet"), groupId: activeGroupId(), play: match.play, horse: match.horse, amount: Number(match.amount), playerId: player.id, receiverId: receiver.id, without: "", source: "whatsapp", status: "pending", settlement: null, messageStatus: "pending", messageStatusByGroup: Object.fromEntries(groupList().map((group) => [group.id, group.id === activeGroupId() ? "pending" : "pending"])), createdAt: now(), updatedAt: now(), chatMeta: { matchId: match.id, playerOfferIds: match.playerOfferIds, receiverOfferIds: match.receiverOfferIds, originalTrack: match.track || "", segmentId: match.segmentId || 1, reviewed: Boolean(match.requiresApproval), reviewReasons: match.reviewReasons || [] } };
            race.bets.push(bet);
            workspace.chatImports.push(match.id);
            created += 1;
        }
        race.updatedAt = now();
    });
    toast(`${created} apuesta(s) importada(s) desde el chat. Revisa los participantes con código temporal.`, "success", { duration: 6500 });
}
function applyLatestChatBoard() {
    const race = activeRace();
    const result = chatAnalysis?.boards?.at(-1);
    if (!race || !result?.board?.length) throw new Error("No hay una llegada detectada para aplicar.");
    mutate("board_from_whatsapp", "race", race.id, `Se aplicó llegada ${result.board.join(".")} desde WhatsApp.`, () => {
        race.board = Array.from({ length: 6 }, (_, index) => String(result.board[index] || ""));
        race.boardPositions = [1, 2, 3, 4, 5, 6];
        race.updatedAt = now();
    });
    toast(`Llegada ${result.board.join(".")} aplicada a la carrera activa.`, "success");
}

function ensureGroupParticipant(groupId, sourceParticipant) {
    if (!sourceParticipant) return null;
    let participant = groupItems(workspace.participants, groupId).find((item) => String(item.code).toLowerCase() === String(sourceParticipant.code).toLowerCase());
    if (participant) return participant;
    participant = { id: uid("p"), groupId, code: sourceParticipant.code, name: sourceParticipant.name || sourceParticipant.code, openingBalance: 0, avalBs: 0, avalUsd: 0, pooled: true, previousWeekBalance: 0, active: true, createdAt: now(), updatedAt: now(), mirrored: true };
    workspace.participants.push(participant);
    return participant;
}
function ensureGroupRace(groupId, sourceRace) {
    let day = groupItems(workspace.days, groupId).find((item) => item.date === sourceRace.date && item.status === "open") || groupItems(workspace.days, groupId).find((item) => item.date === sourceRace.date);
    if (!day) { day = { id: uid("day"), groupId, date: sourceRace.date, status: "open", closure: null, createdAt: now() }; workspace.days.push(day); }
    let race = groupItems(workspace.races, groupId).find((item) => item.date === sourceRace.date && item.racetrack === sourceRace.racetrack && Number(item.number) === Number(sourceRace.number));
    if (!race) {
        const group = groupList().find((item) => item.id === groupId);
        race = { id: uid("race"), groupId, dayId: day.id, date: sourceRace.date, racetrack: sourceRace.racetrack, number: sourceRace.number, exchangeRate: Number(group?.exchangeRate || sourceRace.exchangeRate || 1), status: "open", retired: [], board: ["", "", "", "", "", ""], boardPositions: [1,2,3,4,5,6], bets: [], settledAt: null, closedAt: null, createdAt: now(), updatedAt: now(), mirrored: true };
        workspace.races.push(race);
    }
    workspace.config.activeRaceByGroup[groupId] = race.id;
    return race;
}

async function addBet(values, submitMode) {
    const sourceRace = activeRace();
    if (!sourceRace || sourceRace.status !== "open") throw new Error("La carrera no está abierta.");
    if (!values.play || !values.horse || Number(values.amount) <= 0) throw new Error("Completa jugada, caballo y monto.");
    const sourceMap = pMap(); const sourcePlayer = sourceMap.get(values.playerId); const sourceReceiver = sourceMap.get(values.receiverId);
    if (!sourcePlayer) throw new Error("No se encontró quien juega.");
    const targetIds = selectedCaptureGroupIds();
    const blockedGroups = targetIds.filter((groupId) => {
        if (groupId === activeGroupId()) return sourceRace.status !== "open";
        const matchingRace = groupItems(workspace.races, groupId).find((race) => race.date === sourceRace.date && race.racetrack === sourceRace.racetrack && Number(race.number) === Number(sourceRace.number));
        return matchingRace && matchingRace.status !== "open";
    });
    if (blockedGroups.length) {
        const names = blockedGroups.map((id) => groupList().find((group) => group.id === id)?.name || id).join(", ");
        throw new Error(`No se registró la apuesta: abre la carrera equivalente en ${names}.`);
    }
    const created = []; const status = submitMode === "copy" ? "copied" : submitMode === "whatsapp" ? "opened" : "pending";
    const batchId = targetIds.length > 1 ? uid("batch") : null;
    mutate("bet_created_multi", "bet", uid("batch"), `Se registró ${values.play} (${values.horse}) en ${targetIds.length} grupo(s).`, () => {
        for (const groupId of targetIds) {
            const race = groupId === activeGroupId() ? sourceRace : ensureGroupRace(groupId, sourceRace);
            if (race.status !== "open") continue;
            const player = groupId === activeGroupId() ? sourcePlayer : ensureGroupParticipant(groupId, sourcePlayer);
            const receiver = sourceReceiver ? (groupId === activeGroupId() ? sourceReceiver : ensureGroupParticipant(groupId, sourceReceiver)) : null;
            const bet = { id: uid("bet"), groupId, play: values.play, horse: values.horse, amount: Number(values.amount), playerId: player.id, receiverId: receiver?.id || "", without: values.without || "", source: batchId ? "simultaneous" : "live", status: "pending", settlement: null, messageStatus: status, messageStatusByGroup: Object.fromEntries(groupList().map((group) => [group.id, group.id === groupId ? status : "pending"])), createdAt: now(), updatedAt: now(), batchId };
            race.bets.push(bet); race.updatedAt = now(); created.push({ race, bet, groupId });
        }
    });
    if (!created.length) throw new Error("No había carreras abiertas en los grupos seleccionados.");
    const text = created.map(({ race, bet, groupId }) => { const group = groupList().find((item) => item.id === groupId); return `━━━━━━━━━━━━━━━━\n${group?.name || "Grupo"}\n${generateBetReceiptText(workspace, race, bet)}`; }).join("\n\n");
    if (submitMode === "copy") await copyText(text, `${created.length} comprobante(s) copiados.`);
    if (submitMode === "whatsapp") await openWhatsApp(text);
    if (created.length > 1) toast(`Apuesta registrada simultáneamente en ${created.length} grupos.`, "success");
}
function useAvailableFromForm() { var _a, _b; const form = root.querySelector("#bet-form"); if (!form)
    throw new Error("Abre la cabina de captura."); const player = participantByCode(form.playerCode.value, true), receiver = participantByCode(form.receiverCode.value); const race = activeRace(); const rows = riskRows(race), pr = rows.find((x) => x.participant.id === player.id), rr = receiver ? rows.find((x) => x.participant.id === receiver.id) : null; const current = parseAmount(form.amount.value); if (!current)
    throw new Error("Escribe primero el monto propuesto."); const result = calculateJugarDisponible(current, (_a = pr === null || pr === void 0 ? void 0 : pr.remaining) !== null && _a !== void 0 ? _a : participantAvailable(player, race), (_b = rr === null || rr === void 0 ? void 0 : rr.remaining) !== null && _b !== void 0 ? _b : Infinity); form.amount.value = result.amount; toast(result.changed ? `Monto ajustado a ${number(result.amount)} según el disponible.` : result.message, "success"); }
function settleRace() { const r = activeRace(), pending = r.bets.filter((b) => b.status === "pending"); if (!pending.length)
    throw new Error("No hay apuestas pendientes."); const results = pending.map((b) => [b, settleBet(b, r, workspace.config.commission)]); mutate("race_settled", "race", r.id, `Se liquidaron ${results.length} apuestas.`, () => { for (const [b, s] of results) {
    b.settlement = s;
    b.status = "settled";
} r.status = "settled"; r.settledAt = now(); raceTab = "plan"; }); toast("Resultados procesados.", "success"); }
function parseAdvancedLines(text) { const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return lines.map((line, index) => { const parts = line.split("|").map((x) => x.trim()); if (parts.length < 8)
    throw new Error(`Línea ${index + 1}: faltan columnas.`); const [date, racetrack, raceNumber, play, horse, amount, playerCode, receiverCode, withoutRaw = ""] = parts; const player = participantByCode(playerCode, true), receiver = participantByCode(receiverCode); return { id: uid("adv"), groupId: activeGroupId(), date, racetrack, raceNumber: Number(raceNumber), play: play.toUpperCase(), horse: horse.replace(/x/gi, "*"), amount: parseAmount(amount), playerId: player.id, receiverId: (receiver === null || receiver === void 0 ? void 0 : receiver.id) || "", without: withoutRaw.replace(/^SIN=/i, ""), status: "staged", createdAt: now() }; }); }
function loadAdvancedGroup(key) { const [date, racetrack, num] = key.split("|"); const bets = workspace.advancedBets.filter((b) => b.status === "staged" && `${b.date}|${b.racetrack}|${b.raceNumber}` === key); let race = workspace.races.find((r) => r.date === date && r.racetrack === racetrack && Number(r.number) === Number(num)); if (!race) {
    const day = workspace.days.find((d) => d.date === date) || { id: uid("day"), date, status: "open", closure: null };
    if (!workspace.days.includes(day))
        workspace.days.push(day);
    race = { id: uid("race"), groupId: activeGroupId(), dayId: day.id, date, racetrack, number: Number(num), exchangeRate: workspaceRateForDate(date), status: "open", retired: [], board: ["", "", "", "", "", ""], boardPositions: [1, 2, 3, 4, 5, 6], bets: [], settledAt: null, closedAt: null };
    workspace.races.push(race);
} const loaded = bets.map((b) => ({ id: uid("bet"), play: b.play, horse: b.horse, amount: b.amount, playerId: b.playerId, receiverId: b.receiverId, without: b.without, source: "advanced", status: "pending", settlement: null, messageStatus: "pending", createdAt: b.createdAt, updatedAt: now() })); mutate("advanced_loaded", "race", race.id, `Se cargaron ${loaded.length} adelantadas.`, () => { race.bets.push(...loaded); bets.forEach((b) => { b.status = "loaded"; b.loadedRaceId = race.id; }); setActiveRaceId(race.id); view = "race"; raceTab = "capture"; }); }
function closeDay() { const day = activeDay(), stats = dayStats(day); if (stats.pending)
    throw new Error(`Quedan ${stats.pending} apuestas pendientes.`); if (stats.openRaces.length)
    throw new Error(`Quedan ${stats.openRaces.length} carreras sin finalizar.`); if (Math.abs(stats.controlDifference) > .01)
    throw new Error("La diferencia de control no es cero."); mutate("day_closed", "day", day.id, "Se cerró la jornada.", () => { day.status = "closed"; day.closedAt = now(); day.closure = Object.assign(Object.assign({}, stats), { balances: currentBalanceRows().map(({ participant, balance }) => ({ participantId: participant.id, balance })) }); workspace.days.push({ id: uid("day"), date: today(), status: "open", closure: null }); }); }
function closeWeek() { const to = today(), from = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10); const balances = currentBalanceRows().map(({ participant, balance }) => ({ participantId: participant.id, balance })); const closure = { id: uid("week"), groupId: activeGroupId(), from, to, balances, createdAt: now() }; mutate("week_closed", "week", closure.id, "Se cerró la semana.", () => { workspace.weekClosures.push(closure); workspace.participants.forEach((p) => p.previousWeekBalance = balanceAt(p.id)); }); toast("Semana guardada.", "success"); }
function exportRace() { var _a, _b, _c, _d, _e, _f, _g, _h; const r = activeRace(), map = pMap(), rows = [["Fecha", "Hipódromo", "Carrera", "Jugada", "Caballo", "Monto", "Juega", "Consigue", "Saldo juega", "Saldo consigue", "Comisión", "Estado"]]; for (const b of r.bets)
    rows.push([r.date, r.racetrack, r.number, b.play, b.horse, b.amount, ((_a = map.get(b.playerId)) === null || _a === void 0 ? void 0 : _a.code) || "", ((_b = map.get(b.receiverId)) === null || _b === void 0 ? void 0 : _b.code) || "", (_d = (_c = b.settlement) === null || _c === void 0 ? void 0 : _c.playerAmount) !== null && _d !== void 0 ? _d : "", (_f = (_e = b.settlement) === null || _e === void 0 ? void 0 : _e.receiverAmount) !== null && _f !== void 0 ? _f : "", (_h = (_g = b.settlement) === null || _g === void 0 ? void 0 : _g.commissionAmount) !== null && _h !== void 0 ? _h : "", b.status]); downloadFile(`carrera-${r.racetrack}-${r.number}.csv`, rows.map((x) => x.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8"); }
function exportRisk() { const r = activeRace(), rows = [["Tercio", "Selección", "Juega", "Consigue", "Riesgo total", "Disponible", "Restante"]]; for (const item of riskRows(r))
    for (const e of item.exposures)
        rows.push([item.participant.code, e.selection, e.player, e.receiver, item.totalRisk, item.available, item.free ? "LIBRE" : item.remaining]); downloadFile(`riesgo-${r.racetrack}-${r.number}.csv`, rows.map((x) => x.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8"); }
function exportHistory() { const rows = [["Grupo", "Fecha", "Hipódromo", "Carrera", "Descripción", "Tipo", "Tercio", "Saldo Bs", "Auxiliar", "Dólar", "En dólares"]]; for (const r of filteredHistory())
    rows.push([r.group, r.date, r.racetrack, r.race, r.description, r.role, pCode(r.participantId), r.balanceBs, r.auxiliary, r.rate, r.balanceUsd]); downloadFile(`${activeGroup().name}-jugadas-${today()}.csv`, rows.map((x) => x.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8"); }
function exportBalances() { const rows = [["Código", "Nombre", "Saldo Bs", "Saldo USD", "Aval Bs", "Aval USD", "Disponible"]]; for (const p of groupItems(workspace.participants)) {
    const b = balanceAt(p.id);
    rows.push([p.code, p.name, b, toUsd(b, today()), p.avalBs, p.avalUsd, participantAvailable(p)]);
} downloadFile(`${activeGroup().name}-saldos-${today()}.csv`, rows.map((x) => x.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8"); }
function dailyReportRows(day = activeDay()) {
    var _a, _b, _c, _d, _e;
    const stats = dayStats(day), races = stats.racesList, map = pMap();
    const summary = [
        ["Campo", "Valor"], ["Club", activeCompany()], ["Fecha", day.date], ["Carreras", stats.races],
        ["Apuestas", stats.bets], ["Volumen", stats.volume], ["Comisión", stats.commission],
        ["Pendientes", stats.pending], ["Anuladas", stats.cancelled], ["Diferencia de control", stats.controlDifference],
        ["Tasa Bs/USD", workspaceRateForDate(day.date)]
    ];
    const raceRows = [["Fecha", "Hipódromo", "Carrera", "Estado", "Apuestas", "Pizarra", "Volumen", "Comisión"]];
    const betRows = [["Fecha", "Hipódromo", "Carrera", "Jugada", "Caballo", "Monto", "Juega", "Consigue", "Débito", "Crédito", "Comisión", "Estado"]];
    for (const race of races) {
        const bets = (race.bets || []).filter((bet) => bet.status !== "cancelled");
        raceRows.push([race.date, race.racetrack, race.number, race.status, bets.length, (race.board || []).filter(Boolean).join("."), bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0), bets.reduce((sum, bet) => { var _a; return sum + Number(((_a = bet.settlement) === null || _a === void 0 ? void 0 : _a.commissionAmount) || 0); }, 0)]);
        for (const bet of race.bets || [])
            betRows.push([race.date, race.racetrack, race.number, bet.play, bet.horse, Number(bet.amount || 0), ((_a = map.get(bet.playerId)) === null || _a === void 0 ? void 0 : _a.code) || "", ((_b = map.get(bet.receiverId)) === null || _b === void 0 ? void 0 : _b.code) || "TAQUILLA", Number(((_c = bet.settlement) === null || _c === void 0 ? void 0 : _c.playerAmount) || 0), Number(((_d = bet.settlement) === null || _d === void 0 ? void 0 : _d.receiverAmount) || 0), Number(((_e = bet.settlement) === null || _e === void 0 ? void 0 : _e.commissionAmount) || 0), bet.status]);
    }
    const balances = [["Tercio", "Nombre", "Saldo Bs", "Saldo USD", "Disponible"]];
    for (const { participant, balance } of currentBalanceRows())
        balances.push([participant.code, participant.name, balance, toUsd(balance, day.date), participantAvailable(participant)]);
    return { stats, summary, raceRows, betRows, balances };
}
function exportDailyPdf() {
    const day = activeDay(), report = dailyReportRows(day);
    const lines = [
        `Fecha: ${day.date}`,
        `Carreras: ${report.stats.races} | Apuestas: ${report.stats.bets} | Pendientes: ${report.stats.pending}`,
        `Volumen: ${number(report.stats.volume)} | Comisión: ${number(report.stats.commission)} | Diferencia: ${number(report.stats.controlDifference)}`,
        "", "CARRERAS",
        ...fixedWidthTable(report.raceRows, [10, 20, 7, 10, 8, 16, 14, 12]),
        "", "SALDOS",
        ...fixedWidthTable(report.balances, [12, 20, 15, 14, 15])
    ];
    downloadPdf(`cierre-diario-${day.date}.pdf`, `${activeCompany()} - Cierre diario`, lines);
}
function exportDailyXlsx() { const day = activeDay(), r = dailyReportRows(day); downloadXlsx(`cierre-diario-${day.date}.xlsx`, [{ name: "Resumen", rows: r.summary }, { name: "Carreras", rows: r.raceRows }, { name: "Apuestas", rows: r.betRows }, { name: "Saldos", rows: r.balances }]); }
function weeklyReportRows() {
    const last = groupItems(workspace.weekClosures).at(-1);
    const to = (last === null || last === void 0 ? void 0 : last.to) || today();
    const from = (last === null || last === void 0 ? void 0 : last.from) || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const sourceBalances = (last === null || last === void 0 ? void 0 : last.balances) || currentBalanceRows().map(({ participant, balance }) => ({ participantId: participant.id, balance }));
    const rows = [["Tercio", "Saldo anterior", "Saldo del corte", "Variación", "USD al corte"]];
    for (const item of sourceBalances) {
        const participant = groupItems(workspace.participants).find((p) => p.id === item.participantId);
        if (!participant)
            continue;
        const previous = Number(participant.previousWeekBalance || participant.openingBalance || 0);
        rows.push([participant.code, previous, Number(item.balance || 0), roundMoney(Number(item.balance || 0) - previous), toUsd(item.balance, to)]);
    }
    return { last, from, to, rows };
}
function exportWeeklyPdf() { const r = weeklyReportRows(); downloadPdf(`cierre-semanal-${r.to}.pdf`, `${activeCompany()} - Cierre semanal`, [`Período: ${r.from} al ${r.to}`, "", ...fixedWidthTable(r.rows, [12, 18, 18, 18, 16])]); }
function exportWeeklyXlsx() { const r = weeklyReportRows(); downloadXlsx(`cierre-semanal-${r.to}.xlsx`, [{ name: "Semana", rows: [["Club", activeCompany()], ["Desde", r.from], ["Hasta", r.to], [], ...r.rows] }]); }
function balanceExportRows() { const rows = [["Tercio", "Nombre", "Saldo Bs", "Saldo USD", "Aval Bs", "Aval USD", "Disponible"]]; for (const { participant, balance } of currentBalanceRows())
    rows.push([participant.code, participant.name, balance, toUsd(balance, today()), Number(participant.avalBs || 0), Number(participant.avalUsd || 0), participantAvailable(participant)]); return rows; }
function exportBalancesPdf() { downloadPdf(`disponibles-${today()}.pdf`, `${activeCompany()} - Disponibles`, [`Fecha: ${today()} | Tasa: ${number(workspaceRateForDate(today()))} Bs/USD`, "", ...fixedWidthTable(balanceExportRows(), [12, 20, 16, 14, 14, 12, 16])]); }
function exportBalancesXlsx() { downloadXlsx(`disponibles-${today()}.xlsx`, [{ name: "Disponibles", rows: balanceExportRows() }]); }

root.addEventListener("focusin", (event) => {
    const input = event.target.closest("[data-zero-clear]"); if (input && /^0([.,]0+)?$/.test(String(input.value || "").trim())) input.value = "";
    const participant = event.target.closest("[data-participant-input]"); if (participant) showParticipantSuggestions(participant);
});
root.addEventListener("focusout", (event) => { const participant = event.target.closest("[data-participant-input]"); if (participant) setTimeout(() => participant.closest(".field")?.querySelector("[data-suggestion-menu]")?.classList.remove("is-open"), 180); });
root.addEventListener("input", (event) => {
    const zeroClear = event.target.closest("[data-zero-clear]");
    if (zeroClear && /^0\d/.test(String(zeroClear.value || ""))) zeroClear.value = String(zeroClear.value).replace(/^0+(?=\d)/, "");
    const participant = event.target.closest("[data-participant-input]"); if (participant) showParticipantSuggestions(participant);
    if (event.target.matches('#bet-form [name="amount"]')) { const value = parseAmount(event.target.value); const node = root.querySelector("[data-amount-conversion]"); if (node && activeGroup().showConversion && value) node.textContent = activeCurrency() === "USD" ? `≈ Bs. ${number(value * workspaceRateForDate(today()))}` : `≈ USD ${number(toUsd(value, today()))}`; else if (node) node.textContent = ""; }
});
try { history.replaceState({ hipico: true, view }, ""); } catch (_) {}
window.addEventListener("popstate", () => { if (modal || calendarPicker || view !== "dashboard") { goBack(); try { history.pushState({ hipico: true, view }, ""); } catch (_) {} } });
document.addEventListener("keydown", (event) => { var _a; if (!workspace || event.ctrlKey || event.metaKey || event.altKey)
    return; const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((_a = event.target) === null || _a === void 0 ? void 0 : _a.tagName); if (event.key === "/" && !typing) {
    event.preventDefault();
    view = "race";
    raceTab = "capture";
    queueFocus('[data-fast-input]');
    render();
} });
init().catch((error) => { var _a; console.error("No se pudo iniciar Hípico Control:", error); (_a = globalThis.__HIPICO_BOOT_FAIL__) === null || _a === void 0 ? void 0 : _a.call(globalThis, error); });
