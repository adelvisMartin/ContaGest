(function bootstrapCompatibility(globalScope) {
  "use strict";

  if (!globalScope.globalThis) globalScope.globalThis = globalScope;

  function define(target, name, value) {
    try {
      Object.defineProperty(target, name, { configurable: true, writable: true, value });
    } catch (_) {
      target[name] = value;
    }
  }

  if (!Array.prototype.at) define(Array.prototype, "at", function at(index) {
    const length = this.length >>> 0;
    let normalized = Number(index) || 0;
    if (normalized < 0) normalized += length;
    return normalized < 0 || normalized >= length ? undefined : this[normalized];
  });
  if (!Array.prototype.flatMap) define(Array.prototype, "flatMap", function flatMap(callback, context) {
    const output = [];
    for (let index = 0; index < this.length; index += 1) {
      if (!(index in this)) continue;
      const mapped = callback.call(context, this[index], index, this);
      Array.isArray(mapped) ? output.push(...mapped) : output.push(mapped);
    }
    return output;
  });
  if (!String.prototype.replaceAll) define(String.prototype, "replaceAll", function replaceAll(search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError("replaceAll requiere regex global");
      return this.replace(search, replacement);
    }
    return this.split(String(search)).join(String(replacement));
  });
  if (!Object.fromEntries) define(Object, "fromEntries", function fromEntries(entries) {
    const output = {};
    for (const [key, value] of entries) output[key] = value;
    return output;
  });
  if (!Promise.prototype.finally) define(Promise.prototype, "finally", function promiseFinally(callback) {
    const PromiseType = this.constructor;
    return this.then(
      (value) => PromiseType.resolve(callback()).then(() => value),
      (error) => PromiseType.resolve(callback()).then(() => { throw error; })
    );
  });
  if (!globalScope.structuredClone) {
    globalScope.structuredClone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  if (!globalScope.crypto) globalScope.crypto = {};
  if (typeof globalScope.crypto.randomUUID !== "function") {
    globalScope.crypto.randomUUID = function randomUUID() {
      const bytes = new Uint8Array(16);
      if (typeof globalScope.crypto.getRandomValues === "function") globalScope.crypto.getRandomValues(bytes);
      else for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (byte) => (byte + 256).toString(16).slice(1));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    };
  }
  if (!globalScope.TextEncoder) {
    globalScope.TextEncoder = function TextEncoder() {};
    globalScope.TextEncoder.prototype.encode = function encode(value) {
      const text = unescape(encodeURIComponent(String(value || "")));
      const bytes = new Uint8Array(text.length);
      for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
      return bytes;
    };
  }

  function errorText(error) {
    return String(error?.message || error?.reason?.message || error?.reason || error || "Error de inicio desconocido");
  }

  let watchdog = null;
  globalScope.__HIPICO_SET_BOOT_STATUS__ = (message) => {
    try {
      const label = document.getElementById("app")?.querySelector("[data-boot-status]");
      if (label) label.textContent = String(message || "Preparando la jornada…");
    } catch (_) {}
  };
  globalScope.__HIPICO_BOOT_FAIL__ = (error) => {
    if (globalScope.__HIPICO_BOOT_OK__) return;
    const show = () => {
      const root = document.getElementById("app");
      if (!root || globalScope.__HIPICO_BOOT_OK__) return;
      const message = errorText(error).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      root.className = "app-loading";
      root.innerHTML = `<section style="width:min(92vw,460px);padding:24px;border-radius:24px;background:#fff;box-shadow:0 18px 55px rgba(36,58,49,.14);text-align:left"><div class="brand-mark" style="margin-bottom:14px">HC</div><h1 style="font-size:1.35rem;margin:0 0 8px">No se pudo iniciar Control Hípico</h1><p style="color:#5f6f68;line-height:1.5">La aplicación detectó el problema y evitó quedarse bloqueada. Tus datos locales no se borrarán al abrir la recuperación.</p><code style="display:block;overflow-wrap:anywhere;background:#f3f6f4;padding:10px;border-radius:12px;font-size:.78rem">${message}</code><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button id="hipico-retry" class="button button--primary">Reintentar</button><button id="hipico-safe" class="button">Abrir recuperación segura</button></div></section>`;
      document.getElementById("hipico-retry")?.addEventListener("click", () => location.reload());
      document.getElementById("hipico-safe")?.addEventListener("click", () => {
        // Opening the recovery surface is non-destructive. Any reset is performed
        // only inside recovery.html after its explicit warning and confirmation.
        location.replace("./recovery.html");
      });
    };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", show, { once: true }) : show();
  };
  globalScope.__HIPICO_MARK_BOOT_OK__ = () => {
    globalScope.__HIPICO_BOOT_OK__ = true;
    if (watchdog) clearTimeout(watchdog);
  };
  globalScope.addEventListener("error", (event) => {
    if (!globalScope.__HIPICO_BOOT_OK__) globalScope.__HIPICO_BOOT_FAIL__(event.error || event.message);
  });
  globalScope.addEventListener("unhandledrejection", (event) => {
    if (!globalScope.__HIPICO_BOOT_OK__) globalScope.__HIPICO_BOOT_FAIL__(event.reason);
  });
  watchdog = setTimeout(() => {
    if (!globalScope.__HIPICO_BOOT_OK__) globalScope.__HIPICO_BOOT_FAIL__("El arranque superó 12 segundos. Usa Reintentar o Recuperación segura.");
  }, 12000);

  // Independent trust-state indicator: it does not modify money or sync; it only
  // makes offline/stale authority visible even while the main UI is being refactored.
  import("./offline-status.js").catch(() => {});
})(typeof globalThis !== "undefined" ? globalThis : window);