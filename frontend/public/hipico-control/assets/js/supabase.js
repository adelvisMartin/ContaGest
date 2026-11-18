import { CLOUD_CONFIG, canUseLabDirectTableFallback, cloudConfigurationStatus } from "./config.js";
import { loadCloudSession, saveCloudSession } from "./store.js";
import { subscribeCloudSessionInvalidation, signalOtherTabsCloudSessionInvalidation } from "./cloud-session-tab-signal.js";
let cachedSession = null;
let refreshPromise = null;
let sessionEpoch = 0;
let sessionWriteQueue = Promise.resolve();

// A second tab must not keep a bearer or render a private cloud workspace
// after this origin logs out or begins switching users. The transport carries
// only a constant revocation signal, never an identity or secret.
subscribeCloudSessionInvalidation(() => {
    const expectedEpoch = ++sessionEpoch;
    cachedSession = null;
    refreshPromise = null;
    void persistSession(null, expectedEpoch).catch(() => null);
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
        globalThis.dispatchEvent(new globalThis.CustomEvent("hipico:cloud-session-ended"));
    }
});

export class BackendAuthorityError extends Error {
    constructor(capability, cause = null) {
        super(`La capacidad segura '${capability}' no está disponible en este despliegue.`);
        this.name = "BackendAuthorityError";
        this.code = "HIPICO_RPC_REQUIRED";
        this.capability = capability;
        this.cause = cause || null;
        this.retryable = false;
    }
}

function requireCloudConfiguration() {
    if (!cloudConfigurationStatus().configured) {
        throw new Error("La sincronización no está configurada para este despliegue.");
    }
}
function sessionExpiresSoon(session, marginSeconds = 60) {
    if (!(session === null || session === void 0 ? void 0 : session.access_token))
        return true;
    const expiresAt = Number(session.expires_at || 0);
    return Boolean(expiresAt && Date.now() / 1000 >= expiresAt - marginSeconds);
}
function authHeaders(token, extra = {}) {
    return Object.assign({ apikey: CLOUD_CONFIG.publishableKey, Authorization: `Bearer ${token || CLOUD_CONFIG.publishableKey}`, "Content-Type": "application/json" }, extra);
}
function errorMessage(body, status) {
    if ((body === null || body === void 0 ? void 0 : body.code) === "40001" || String((body === null || body === void 0 ? void 0 : body.message) || "").includes("HIPICO_VERSION_CONFLICT")) {
        return "Otro dispositivo actualizó los datos. Se fusionarán antes de reintentar.";
    }
    return (body === null || body === void 0 ? void 0 : body.msg) || (body === null || body === void 0 ? void 0 : body.message) || (body === null || body === void 0 ? void 0 : body.error_description) || (body === null || body === void 0 ? void 0 : body.error) || `Error ${status}`;
}
function isRpcUnavailable(error) {
    return (error === null || error === void 0 ? void 0 : error.status) === 404 || ["PGRST202", "42883"].includes(error === null || error === void 0 ? void 0 : error.code);
}
function requireRpcOrLabFallback(error, capability) {
    if (!isRpcUnavailable(error))
        throw error;
    if (!canUseLabDirectTableFallback())
        throw new BackendAuthorityError(capability, error);
}
export function isVersionConflict(error) {
    var _a;
    return (error === null || error === void 0 ? void 0 : error.code) === "40001" || String(((_a = error === null || error === void 0 ? void 0 : error.body) === null || _a === void 0 ? void 0 : _a.message) || "").includes("HIPICO_VERSION_CONFLICT");
}
async function request(path, options = {}) {
    requireCloudConfiguration();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUD_CONFIG.requestTimeoutMs);
    try {
        const response = await fetch(`${CLOUD_CONFIG.supabaseUrl}${path}`, Object.assign(Object.assign({}, options), { signal: options.signal || controller.signal, cache: "no-store" }));
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        }
        catch (_a) {
            body = text;
        }
        if (!response.ok) {
            const error = new Error(errorMessage(body, response.status));
            error.status = response.status;
            error.code = (body === null || body === void 0 ? void 0 : body.code) || null;
            error.body = body;
            throw error;
        }
        return body;
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.name) === "AbortError") {
            const timeoutError = new Error("La nube tardó demasiado en responder.");
            timeoutError.code = "HIPICO_CLOUD_TIMEOUT";
            timeoutError.retryable = true;
            throw timeoutError;
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function persistSession(session, expectedEpoch = sessionEpoch) {
    const nextSession = (session === null || session === void 0 ? void 0 : session.access_token) ? session : null;
    // Serialize durable writes: logout must be the last private-state write
    // even if a refresh started persisting immediately before revocation.
    const write = sessionWriteQueue.catch(() => null).then(async () => {
        if (expectedEpoch !== sessionEpoch)
            return null;
        // Never publish a bearer before durable storage has completed.
        // A logout/user switch while IndexedDB is writing invalidates the
        // pending write even if it eventually resolves successfully.
        await saveCloudSession(nextSession);
        if (expectedEpoch !== sessionEpoch) return null;
        cachedSession = nextSession;
        return cachedSession;
    });
    sessionWriteQueue = write.catch(() => null);
    return write;
}
export async function refreshCloudSession() {
    if (refreshPromise)
        return refreshPromise;
    const expectedEpoch = sessionEpoch;
    const token = cachedSession?.refresh_token;
    if (!token)
        return persistSession(null, expectedEpoch);
    const pending = request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: authHeaders(null),
        body: JSON.stringify({ refresh_token: token })
    })
        .then((session) => expectedEpoch === sessionEpoch ? persistSession(session, expectedEpoch) : null)
        .catch(async () => {
        if (expectedEpoch === sessionEpoch)
            await persistSession(null, expectedEpoch);
        return null;
    });
    const observed = pending.finally(() => {
        if (refreshPromise === observed)
            refreshPromise = null;
    });
    refreshPromise = observed;
    return observed;
}
export async function initializeCloudSession() {
    var _a;
    const expectedEpoch = sessionEpoch;
    // A user switch may have queued a private-store purge. Never rehydrate
    // the former owner from IndexedDB while that purge is still pending.
    await sessionWriteQueue;
    if (expectedEpoch !== sessionEpoch)
        return currentSession();
    const loaded = await loadCloudSession();
    if (expectedEpoch !== sessionEpoch)
        return currentSession();
    cachedSession = loaded;
    if (!(cachedSession === null || cachedSession === void 0 ? void 0 : cachedSession.access_token))
        return null;
    if (!sessionExpiresSoon(cachedSession))
        return cachedSession;
    if (((_a = globalThis.navigator) === null || _a === void 0 ? void 0 : _a.onLine) === false)
        return cachedSession;
    return refreshCloudSession();
}
export function currentSession() {
    return (cachedSession === null || cachedSession === void 0 ? void 0 : cachedSession.access_token) ? cachedSession : null;
}
export function sessionRole(session = currentSession()) {
    var _a, _b;
    return String(((_b = (_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.app_metadata) === null || _b === void 0 ? void 0 : _b.role)
        || "operator").toLowerCase();
}
export function isAdminSession(session = currentSession()) {
    return sessionRole(session) === "admin";
}
export function currentUserSummary(profile = null) {
    var _a, _b, _c, _d, _e;
    const session = currentSession();
    const role = String((profile === null || profile === void 0 ? void 0 : profile.role) || sessionRole(session));
    return {
        id: ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id) || "",
        email: ((_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.email) || "",
        displayName: (profile === null || profile === void 0 ? void 0 : profile.display_name)
            || ((_d = (_c = session === null || session === void 0 ? void 0 : session.user) === null || _c === void 0 ? void 0 : _c.user_metadata) === null || _d === void 0 ? void 0 : _d.name)
            || ((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.email)
            || "Operador Hípico",
        role,
        isAdmin: role === "admin"
    };
}
async function validAccessToken() {
    if (!(cachedSession === null || cachedSession === void 0 ? void 0 : cachedSession.access_token))
        throw new Error("La sesión de nube no está activa.");
    if (!sessionExpiresSoon(cachedSession))
        return cachedSession.access_token;
    const refreshed = await refreshCloudSession();
    if (!(refreshed === null || refreshed === void 0 ? void 0 : refreshed.access_token))
        throw new Error("La sesión venció. Inicia sesión nuevamente.");
    return refreshed.access_token;
}
async function authorizedRequest(path, options = {}, retry = true) {
    // A logout or user switch invalidates every outstanding private response:
    // never deliver an old owner's workspace or retry a 401 with a new user.
    const expectedEpoch = sessionEpoch;
    const assertCurrentSession = () => {
        if (expectedEpoch !== sessionEpoch || !cachedSession?.access_token) {
            throw Object.assign(new Error("La sesión cambió. Inicia sesión nuevamente para continuar."), {
                code: "HIPICO_SESSION_CHANGED", retryable: false
            });
        }
    };
    const token = await validAccessToken();
    assertCurrentSession();
    try {
        const response = await request(path, Object.assign(Object.assign({}, options), { headers: authHeaders(token, options.headers || {}) }));
        assertCurrentSession();
        return response;
    }
    catch (error) {
        assertCurrentSession();
        if (retry && (error === null || error === void 0 ? void 0 : error.status) === 401 && (cachedSession === null || cachedSession === void 0 ? void 0 : cachedSession.refresh_token)) {
            const refreshed = await refreshCloudSession();
            assertCurrentSession();
            if (refreshed === null || refreshed === void 0 ? void 0 : refreshed.access_token)
                return authorizedRequest(path, options, false);
        }
        throw error;
    }
}
function validateCredentials(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail))
        throw new Error("Escribe un correo válido.");
    if (String(password || "").length < 10)
        throw new Error("La contraseña debe tener al menos 10 caracteres.");
    return { email: normalizedEmail, password: String(password) };
}
export async function signIn(email, password) {
    const credentials = validateCredentials(email, password);
    const expectedEpoch = ++sessionEpoch;
    refreshPromise = null;
    // Switching users must invalidate the previous token synchronously;
    // a new protected read must never observe the old owner mid-login.
    cachedSession = null;
    signalOtherTabsCloudSessionInvalidation();
    await persistSession(null, expectedEpoch);
    if (expectedEpoch !== sessionEpoch) return null;
    const data = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: authHeaders(null),
        body: JSON.stringify(credentials)
    });
    return expectedEpoch === sessionEpoch ? persistSession(data, expectedEpoch) : null;
}
export async function signUp(email, password) {
    const credentials = validateCredentials(email, password);
    const expectedEpoch = ++sessionEpoch;
    refreshPromise = null;
    cachedSession = null;
    signalOtherTabsCloudSessionInvalidation();
    await persistSession(null, expectedEpoch);
    if (expectedEpoch !== sessionEpoch) return null;
    const data = await request("/auth/v1/signup", {
        method: "POST",
        headers: authHeaders(null),
        body: JSON.stringify(Object.assign(Object.assign({}, credentials), { data: { app: "hipico-control" } }))
    });
    if (expectedEpoch !== sessionEpoch)
        return null;
    if (data?.access_token)
        await persistSession(data, expectedEpoch);
    return data;
}
export async function signOut() {
    const token = cachedSession?.access_token;
    // Invalidate in-flight refresh/login responses before clearing IndexedDB.
    const logoutEpoch = ++sessionEpoch;
    refreshPromise = null;
    // Invalidate the bearer synchronously, before the first await/IndexedDB
    // operation. No protected request may start with a logged-out identity.
    cachedSession = null;
    signalOtherTabsCloudSessionInvalidation();
    // Local credentials must be cleared even when the cloud is unreachable.
    // A failed local purge is an error, not a successful logout.
    await persistSession(null, logoutEpoch);
    if (!token)
        return { localCleared: true, remoteRevoked: true };
    if (globalThis.navigator?.onLine === false)
        return { localCleared: true, remoteRevoked: false };
    try {
        await request("/auth/v1/logout", { method: "POST", headers: authHeaders(token) });
        return { localCleared: true, remoteRevoked: true };
    }
    catch {
        // Do not claim that the remote bearer was revoked on a failed request.
        return { localCleared: true, remoteRevoked: false };
    }
}
export function isTransientCloudError(error) {
    const status = Number(error === null || error === void 0 ? void 0 : error.status) || 0;
    return Boolean((error === null || error === void 0 ? void 0 : error.retryable)
        || (error === null || error === void 0 ? void 0 : error.code) === "HIPICO_CLOUD_TIMEOUT"
        || status >= 500
        || (!status && (error === null || error === void 0 ? void 0 : error.name) === "TypeError"));
}
export async function fetchCloudAccess() {
    const rows = await authorizedRequest("/rest/v1/rpc/hipico_get_my_access", {
        method: "POST",
        body: "{}"
    });
    return Array.isArray(rows) ? (rows[0] || null) : (rows || null);
}
export async function fetchCloudProfile() {
    var _a, _b;
    try {
        return await authorizedRequest(`/rest/v1/rpc/${CLOUD_CONFIG.profileRpc}`, {
            method: "POST",
            body: "{}"
        });
    }
    catch (error) {
        requireRpcOrLabFallback(error, "profile.read");
        const session = currentSession();
        const rows = await authorizedRequest(`/rest/v1/${CLOUD_CONFIG.profileTable}?owner_id=eq.${encodeURIComponent(((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id) || "")}&select=owner_id,display_name,role,preferences,updated_at&limit=1`);
        return (_b = rows === null || rows === void 0 ? void 0 : rows[0]) !== null && _b !== void 0 ? _b : null;
    }
}
export async function fetchCloudWorkspace() {
    var _a, _b;
    try {
        const rows = await authorizedRequest(`/rest/v1/rpc/${CLOUD_CONFIG.getWorkspaceRpc}`, {
            method: "POST",
            body: "{}"
        });
        return (_a = rows === null || rows === void 0 ? void 0 : rows[0]) !== null && _a !== void 0 ? _a : null;
    }
    catch (error) {
        requireRpcOrLabFallback(error, "workspace.read");
        const rows = await authorizedRequest(`/rest/v1/${CLOUD_CONFIG.workspaceTable}?select=id,state,version,updated_at&order=updated_at.desc&limit=1`);
        return (_b = rows === null || rows === void 0 ? void 0 : rows[0]) !== null && _b !== void 0 ? _b : null;
    }
}
export async function fetchRecentShadowEvaluations(limit = 12) {
    var _a;
    const safeLimit = Math.min(30, Math.max(1, Math.trunc(Number(limit) || 12)));
    try {
        const rows = await authorizedRequest(`/rest/v1/rpc/${CLOUD_CONFIG.recentShadowRpc}`, {
            method: "POST",
            body: JSON.stringify({ p_limit: safeLimit })
        });
        return Array.isArray(rows) ? rows : [];
    }
    catch (error) {
        requireRpcOrLabFallback(error, "shadow.read_recent");
        const select = "id,source_group_key,lab_group_key,source_external_message_id,prediction_type,predicted_payload,predicted_at,match_status,reviewed_at";
        return (_a = await authorizedRequest(`/rest/v1/${CLOUD_CONFIG.shadowTable}?select=${select}&order=predicted_at.desc&limit=${safeLimit}`)) !== null && _a !== void 0 ? _a : [];
    }
}
export async function saveCloudWorkspace(workspace, existingId = null, expectedVersion = 0) {
    var _a, _b;
    const session = currentSession();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id))
        throw new Error("La sesión no contiene un usuario válido.");
    try {
        return await authorizedRequest(`/rest/v1/rpc/${CLOUD_CONFIG.saveWorkspaceRpc}`, {
            method: "POST",
            body: JSON.stringify({
                p_name: workspace.config.clubName || "Control Hípico",
                p_state: workspace,
                p_expected_version: Number(expectedVersion || 0)
            })
        });
    }
    catch (error) {
        requireRpcOrLabFallback(error, "workspace.write");
        const body = {
            owner_id: session.user.id,
            name: workspace.config.clubName || "Control Hípico",
            state: workspace,
            version: Math.max(1, Number(expectedVersion || workspace.version || 1))
        };
        if (existingId)
            body.id = existingId;
        const rows = await authorizedRequest(`/rest/v1/${CLOUD_CONFIG.workspaceTable}?on_conflict=owner_id`, {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify(body)
        });
        return (_b = rows === null || rows === void 0 ? void 0 : rows[0]) !== null && _b !== void 0 ? _b : null;
    }
}
export async function appendCloudAudit(event, workspaceId = null) {
    var _a, _b;
    if (!((_b = (_a = currentSession()) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.id))
        return;
    try {
        await authorizedRequest(`/rest/v1/rpc/${CLOUD_CONFIG.appendAuditRpc}`, {
            method: "POST",
            body: JSON.stringify({
                p_workspace_id: workspaceId,
                p_action: event.action,
                p_entity_type: event.entityType,
                p_entity_id: event.entityId || null,
                p_payload: event
            })
        });
    }
    catch (error) {
        requireRpcOrLabFallback(error, "audit.append");
        await authorizedRequest(`/rest/v1/${CLOUD_CONFIG.auditTable}`, {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
                owner_id: currentSession().user.id,
                workspace_id: workspaceId,
                action: event.action,
                entity_type: event.entityType,
                entity_id: event.entityId,
                payload: event
            })
        });
    }
}
export const __test__ = {
    sessionExpiresSoon,
    validateCredentials,
    errorMessage,
    isVersionConflict,
    isRpcUnavailable,
    sessionRole,
    requireRpcOrLabFallback
};
