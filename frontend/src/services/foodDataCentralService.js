const cache = new Map();

const getJson = async (url, { signal } = {}) => {
  const response = await fetch(url, { method:'GET', headers:{ Accept:'application/json' }, signal, credentials:'same-origin' });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || `FoodData Central respondió ${response.status}.`);
    error.code = payload?.error || `HTTP_${response.status}`;
    throw error;
  }
  return payload;
};

export const FoodDataCentralService = {
  async search(query, { pageSize = 8, signal } = {}) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const size = Math.min(25, Math.max(1, Number(pageSize || 8)));
    const key = `${q.toLowerCase()}|${size}`;
    if (cache.has(key)) return cache.get(key);
    const payload = await getJson(`/api/fooddata?q=${encodeURIComponent(q)}&pageSize=${size}`, { signal });
    const foods = Array.isArray(payload?.foods) ? payload.foods : [];
    cache.set(key, foods);
    return foods;
  },
  async detail(fdcId, { signal } = {}) {
    const id = String(fdcId || '').trim();
    if (!/^\d{1,12}$/.test(id)) throw new Error('Identificador USDA inválido.');
    const payload = await getJson(`/api/fooddata?fdcId=${encodeURIComponent(id)}`, { signal });
    return payload?.food || null;
  },
  clearCache() { cache.clear(); }
};
