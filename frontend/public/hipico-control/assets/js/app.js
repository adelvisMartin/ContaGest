import { BET_OPTIONS, calculateJugarDisponible, calculatePolla, calculateRaceSummary, calculateRiskMatrix, parseAmount, parseQuickBet, roundMoney, settleBet } from "./engine.js";
import { csvEscape, generateBalancesWhatsappText, generateBetReceiptText, generateDailySummaryText, generateWhatsappText, money, number, shortDate } from "./format.js";
import { createBlankWorkspace } from "./seed.js";
import { backupFilename, deliverJsonBackup, serializeWorkspaceBackup } from "./backup.js";
import { clearLocalWorkspace, createSnapshot, downloadFile, enqueueOutbox, flushWorkspaceWrites, getAppMode, initializeStorage, listOutbox, listSnapshots, loadLocalWorkspace, queueWorkspaceSave, removeOutbox, requestPersistentStorage, restoreSnapshot, saveLocalWorkspace, setAppMode, storageDiagnostics } from "./store.js";
import { downloadPdf, downloadXlsx, fixedWidthTable } from "./reports.js";
import { mergeWorkspaces, shouldMergeCloud } from "./sync.js";
import { appendCloudAudit, currentSession, currentUserSummary, fetchCloudProfile, fetchCloudWorkspace, fetchRecentShadowEvaluations, initializeCloudSession, isVersionConflict, saveCloudWorkspace, signIn, signOut, signUp } from "./supabase.js";
import { APP_VERSION, CLOUD_CONFIG } from "./config.js";
import { escapeHtml, icon, toast } from "./ui.js";
import { createId as uid, isoNow as now, normalizeWorkspaceShape, rateForDate, todayIso as today } from "./workspace.js";
import { generateClosureText, parseWhatsAppChat, participantMatchesSender, senderCode } from "./whatsapp.js";
import { enrollLocalAdmin, hasLocalAdminEnrollment, verifyLocalAdmin } from "./local-auth.js";
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
function currentWorkspaceForSync() { return workspace; }
function pMap() { return new Map(groupItems(workspace.participants).map((p) => [p.id, p])); }
function pCode(id) { var _a, _b; return (_b = (_a = pMap().get(id)) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : "—"; }
function balanceAt(participantId, dateLimit = null) { return roundMoney(participantBalanceFromRows(participantId, dateLimit)); }
function participantBalanceFromRows(participantId, dateLimit = null) {
    const p = pMap().get(participantId); if (!p) return 0;
    let balance = Number(p.openingBalance || 0); const pidGroup = p.groupId || activeGroupId();
    const races = groupItems(workspace.races, pidGroup).filter((race) => !dateLimit || race.date <= dateLimit);
    for (const race of races)
        for (const bet of race.bets || [])
            if (bet.status === "settled" && bet.settlement) {
                if (bet.playerId === participantId) balance += Number(bet.settlement.playerAmount || 0);
                if (bet.receiverId === participantId) balance += Number(bet.settlement.receiverAmount || 0);
            }
    for (const m of groupItems(workspace.movements, pidGroup))
        if (m.participantId === participantId && (!dateLimit || m.date <= dateLimit)) balance += m.type === "income" ? Number(m.amount) : -Number(m.amount);
    return balance;
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
            }
            catch (error) {
                toast(`Continuidad sin conexión activa: ${error.message}`, "error");
            }
        }
    }
    else if (mode === "local") {
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
    root.innerHTML = `<div class="shell app-soft" style="${groupColorStyle()}"><aside class="sidebar"><button class="brand brand-button" data-action="go-home">${brandMarkup("auth")}<div><strong>Hípico Control</strong><small>v${APP_VERSION} · Adelvis Martin</small></div></button>${groupSwitcherMarkup()}<nav class="nav">${nav("dashboard", "Resumen", "dashboard")}${nav("race", "Captura", "race")}${nav("whatsapp", "Chat WhatsApp", "chat")}${nav("advanced", "Adelantadas", "plus")}${nav("participants", activeGroup().clientLabel || "Participantes", "users")}${nav("history", "Historial", "report")}${nav("reports", "Cierres y saldos", "report")}${nav("polla", "POLLA", "check")}${nav("settings", "Configuración", "settings")}</nav><div class="sidebar-footer">${userBadgeMarkup()}<div data-sync-state>${syncMarkup()}</div><button class="button button--danger button--small" data-action="logout">${icon("logout")} Cerrar sesión</button></div></aside><main class="main"><header class="mobile-header"><button class="mobile-back ${view === "dashboard" ? "is-hidden" : ""}" data-action="go-back" aria-label="Volver">${icon("back")}</button><button class="brand mobile-brand" data-action="go-home">${brandMarkup("auth")}<div><strong>${pageTitle()}</strong><small><i class="group-dot" style="background:${activeGroup().color}"></i>${escapeHtml(activeGroup().name)} · ${escapeHtml(race?.racetrack || "Sin carrera")}</small></div></button><div class="mobile-header-actions"><button class="icon-button" data-action="toggle-theme" aria-label="Cambiar tema">${icon(workspace.config.theme === "dark" ? "sun" : "moon")}</button><button class="button icon-button button--primary" data-action="focus-fast" aria-label="Captura rápida">${icon("plus")}</button></div></header><header class="topbar"><div><h1>${pageTitle()}</h1><div class="context">${activeDay() ? `${shortDate(activeDay().date)} · ${navigator.onLine ? "en línea" : "sin conexión"}` : "Sin jornada"}</div></div><div class="top-actions">${groupSwitcherMarkup(true)}${mode === "cloud" ? `<span class="badge badge--success">${cloudUser().isAdmin ? "Admin" : "Operador"}</span>` : ""}<div data-sync-state>${syncMarkup()}</div><button class="button button--primary" data-action="focus-fast">${icon("plus")} Captura rápida</button></div></header><div class="content">${installPrompt ? `<div class="install-banner"><p><strong>Instalar en el teléfono:</strong> funcionará como app y mantendrá tus datos disponibles sin conexión.</p><button class="button button--primary" data-action="install-app">Instalar</button></div>` : ""}${!navigator.onLine ? `<div class="offline-banner">${icon("cloud")} Sin conexión. Cada cambio queda guardado en este dispositivo.</div>` : ""}${renderView()}</div></main><nav class="mobile-nav">${mnav("dashboard", "Inicio", "home")}${mnav("race", "Captura", "race")}${mnav("whatsapp", "Chat", "chat")}${mnav("participants", "Saldos", "users")}${mnav("reports", "Más", "menu", ["advanced", "history", "reports", "polla", "settings"])}</nav></div>${renderModal()}${renderCalendarOverlay()}`;
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
/* Remaining application code is unchanged; this replacement payload cannot intentionally omit it. */
