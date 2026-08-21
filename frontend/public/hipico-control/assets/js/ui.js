export const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
export function icon(name) {
  const icons = {
    dashboard:'<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
    race:'<path d="M5 20c5-1 8-4 9-9l2 2 3-5-5-3-2 4c-4 0-7 2-9 5m3 6 2-4 4 1 2 3"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    report:'<path d="M4 19V5M4 19h16M8 16v-5M12 16V7M16 16v-8M20 16v-3"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.35.7.6 1 .28.3.67.47 1.1.47H21v4h-.1A1.7 1.7 0 0 0 19.4 15z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>', cloud:'<path d="M17.5 19H6a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 17.3 9.5 4.75 4.75 0 0 1 17.5 19z"/>',
    download:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>', trash:'<path d="M3 6h18M8 6V4h8v2m-9 0 1 15h8l1-15M10 11v5M14 11v5"/>', check:'<path d="m5 12 4 4L19 6"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    back:'<path d="m15 18-6-6 6-6"/>', home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    logout:'<path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>', moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
    group:'<path d="M7 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 9a3 3 0 0 0 0 6M19 9a3 3 0 0 1 0 6"/>',
    chat:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-3a4 4 0 0 1-1-2.65V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4z"/><path d="M7 8h10M7 12h7"/>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.check}</svg>`;
}
export function toast(message, type = "info", options = {}) {
  const container = document.querySelector("#toast-region"); if (!container) return;
  const title = options.title || ({ success: "Listo", error: "Revisa esto", info: "Información", warning: "Atención" }[type] || "Información");
  const node = document.createElement("div"); node.className = `toast toast--${type}`;
  node.innerHTML = `<div class="toast__icon">${icon(type === "success" ? "check" : type === "error" ? "settings" : "cloud")}</div><div class="toast__copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div><button class="toast__close" type="button" aria-label="Cerrar">×</button><i class="toast__progress"></i>`;
  const close = () => { node.classList.remove("is-visible"); setTimeout(() => node.remove(), 220); };
  node.querySelector(".toast__close").addEventListener("click", close); container.append(node); requestAnimationFrame(() => node.classList.add("is-visible"));
  setTimeout(close, Number(options.duration || 4200));
}
