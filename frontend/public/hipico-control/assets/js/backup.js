function currentPlatform() {
    try {
        return globalThis.Capacitor?.getPlatform?.() || "web";
    }
    catch (_) {
        return "web";
    }
}
function isNativeAndroid() {
    if (currentPlatform() === "android") return true;
    const ua = String(globalThis.navigator?.userAgent || "");
    return /;\s*wv\)/i.test(ua) || /\bAndroid\b/i.test(ua) && /\bVersion\/\d/i.test(ua);
}
function createJsonFile(filename, jsonText) {
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    try {
        return new File([blob], filename, { type: blob.type, lastModified: Date.now() });
    }
    catch (_) {
        blob.name = filename;
        return blob;
    }
}
async function saveWithFilePicker(filename, jsonText) {
    if (typeof globalThis.showSaveFilePicker !== "function") return null;
    const handle = await globalThis.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Respaldo JSON", accept: { "application/json": [".json"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(jsonText);
    await writable.close();
    return { ok: true, method: "picker" };
}
async function shareFile(filename, jsonText) {
    if (typeof navigator?.share !== "function") return null;
    const file = createJsonFile(filename, jsonText);
    const payload = { title: "Respaldo Control Hípico", text: "Guarda este archivo para restaurar la aplicación.", files: [file] };
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) return null;
    await navigator.share(payload);
    return { ok: true, method: "share" };
}
function triggerBrowserDownload(filename, jsonText) {
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, method: "download" };
}
export function serializeWorkspaceBackup(workspace) {
    return JSON.stringify(workspace, null, 2);
}
export function backupFilename(dateIso) {
    return `hipico-control-${String(dateIso || "respaldo")}.json`;
}
export async function deliverJsonBackup(filename, jsonText, options = {}) {
    const platform = options.platform || currentPlatform();
    const nativeAndroid = options.nativeAndroid ?? isNativeAndroid();
    try {
        const picker = await saveWithFilePicker(filename, jsonText);
        if (picker) return picker;
    }
    catch (error) {
        if (error?.name === "AbortError") return { ok: false, method: "cancelled", error };
    }
    try {
        const shared = await shareFile(filename, jsonText);
        if (shared) return shared;
    }
    catch (error) {
        if (error?.name === "AbortError") return { ok: false, method: "cancelled", error };
    }
    if (platform === "web" && !nativeAndroid) return triggerBrowserDownload(filename, jsonText);
    return { ok: false, method: "manual" };
}
export const __test__ = { currentPlatform, isNativeAndroid, createJsonFile };
