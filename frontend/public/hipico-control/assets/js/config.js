const runtime = globalThis.__HIPICO_CONFIG__ || {};
function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
}
function normalizeDeploymentMode(value) {
    const mode = String(value || "production").trim().toLowerCase();
    return ["lab", "pilot", "production"].includes(mode) ? mode : "production";
}
export const APP_VERSION = "1.13.0-rc2";
export const CLOUD_CONFIG = Object.freeze({
    supabaseUrl: normalizeUrl(runtime.supabaseUrl),
    publishableKey: String(runtime.publishableKey || "").trim(),
    workspaceTable: String(runtime.workspaceTable || "hipico_workspaces"),
    auditTable: String(runtime.auditTable || "hipico_audit_events"),
    profileTable: String(runtime.profileTable || "hipico_profiles"),
    shadowTable: String(runtime.shadowTable || "hipico_shadow_evaluations"),
    getWorkspaceRpc: String(runtime.getWorkspaceRpc || "hipico_get_workspace"),
    saveWorkspaceRpc: String(runtime.saveWorkspaceRpc || "hipico_save_workspace"),
    appendAuditRpc: String(runtime.appendAuditRpc || "hipico_append_audit"),
    profileRpc: String(runtime.profileRpc || "hipico_get_profile"),
    recentShadowRpc: String(runtime.recentShadowRpc || "hipico_recent_shadow_evaluations"),
    deploymentMode: normalizeDeploymentMode(runtime.deploymentMode),
    allowLabDirectTableFallback: runtime.allowLabDirectTableFallback === true,
    allowSignup: runtime.allowSignup === true,
    requestTimeoutMs: 15000
});
export function canUseLabDirectTableFallback() {
    return CLOUD_CONFIG.deploymentMode === "lab" && CLOUD_CONFIG.allowLabDirectTableFallback === true;
}
export function cloudConfigurationStatus() {
    const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CLOUD_CONFIG.supabaseUrl)
        && CLOUD_CONFIG.publishableKey.startsWith("sb_publishable_");
    return {
        configured,
        url: CLOUD_CONFIG.supabaseUrl,
        deploymentMode: CLOUD_CONFIG.deploymentMode,
        labDirectTableFallbackEnabled: canUseLabDirectTableFallback()
    };
}
