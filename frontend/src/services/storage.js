// Compatibility storage service.
// This file exists to keep older cached modules and future pages from failing
// when they import `src/services/storage.js`.
const safeJson = (value, fallback = null) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export const StorageService = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : safeJson(raw, fallback);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); return true; } catch { return false; }
  },
  clear(prefix = '') {
    try {
      if (!prefix) { localStorage.clear(); return true; }
      Object.keys(localStorage).filter((key) => key.startsWith(prefix)).forEach((key) => localStorage.removeItem(key));
      return true;
    } catch {
      return false;
    }
  }
};

export const Storage = StorageService;
export default StorageService;
