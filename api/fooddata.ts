const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const MAX_QUERY = 120;
const MAX_PAGE_SIZE = 25;
const USDA_DEMO_KEY = 'DEMO_KEY';

const nutrientNumber = (nutrients: any[] = [], names: string[] = []) => {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const row = nutrients.find((item) => wanted.has(String(item?.nutrientName || item?.name || '').toLowerCase()));
  const value = Number(row?.value ?? row?.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const normalizeFood = (food: any) => ({
  fdcId: food?.fdcId,
  description: food?.description || '',
  brandOwner: food?.brandOwner || food?.brandName || '',
  dataType: food?.dataType || '',
  servingSize: Number(food?.servingSize || 0) || null,
  servingSizeUnit: food?.servingSizeUnit || '',
  nutrients: {
    calories: nutrientNumber(food?.foodNutrients, ['Energy', 'Energy (Atwater General Factors)', 'Energy (Atwater Specific Factors)']),
    proteinG: nutrientNumber(food?.foodNutrients, ['Protein']),
    carbsG: nutrientNumber(food?.foodNutrients, ['Carbohydrate, by difference']),
    fatG: nutrientNumber(food?.foodNutrients, ['Total lipid (fat)']),
    fiberG: nutrientNumber(food?.foodNutrients, ['Fiber, total dietary']),
    sodiumMg: nutrientNumber(food?.foodNutrients, ['Sodium, Na']),
    potassiumMg: nutrientNumber(food?.foodNutrients, ['Potassium, K']),
    calciumMg: nutrientNumber(food?.foodNutrients, ['Calcium, Ca']),
    ironMg: nutrientNumber(food?.foodNutrients, ['Iron, Fe'])
  }
});

export default async function foodDataHandler(request: any, response: any) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  }

  // USDA documents DEMO_KEY for low-volume exploration. Production should set
  // FDC_API_KEY server-side; the browser never receives either key.
  const configuredKey = String(process.env.FDC_API_KEY || '').trim();
  const apiKey = configuredKey || USDA_DEMO_KEY;
  const keyMode = configuredKey ? 'configured' : 'demo';

  const q = String(request.query?.q || '').trim().slice(0, MAX_QUERY);
  const fdcId = String(request.query?.fdcId || '').trim();

  try {
    if (fdcId) {
      if (!/^\d{1,12}$/.test(fdcId)) return response.status(400).json({ ok:false, error:'INVALID_FDC_ID' });
      const upstream = await fetch(`${USDA_BASE}/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(apiKey)}`, {
        headers:{ Accept:'application/json' }
      });
      if (!upstream.ok) throw new Error(`USDA_${upstream.status}`);
      const payload = await upstream.json();
      response.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return response.status(200).json({ ok:true, source:'USDA FoodData Central', keyMode, food:normalizeFood(payload) });
    }

    if (q.length < 2) return response.status(400).json({ ok:false, error:'QUERY_TOO_SHORT', message:'Escribe al menos 2 caracteres.' });
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(request.query?.pageSize || 10) || 10));
    const upstream = await fetch(`${USDA_BASE}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({ query:q, pageSize, pageNumber:1, dataType:['Foundation','SR Legacy','Survey (FNDDS)','Branded'] })
    });
    if (!upstream.ok) throw new Error(`USDA_${upstream.status}`);
    const payload = await upstream.json();
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
    return response.status(200).json({
      ok:true,
      source:'USDA FoodData Central',
      keyMode,
      query:q,
      totalHits:Number(payload?.totalHits || 0),
      foods:(payload?.foods || []).slice(0, pageSize).map(normalizeFood)
    });
  } catch (error: any) {
    console.error('[FoodData Central]', error?.message || error);
    response.setHeader('Cache-Control', 'no-store');
    const demoLimited = keyMode === 'demo';
    return response.status(502).json({
      ok:false,
      error: demoLimited ? 'FDC_DEMO_LIMIT_OR_UPSTREAM_ERROR' : 'FDC_UPSTREAM_ERROR',
      message: demoLimited
        ? 'FoodData Central no respondió con la clave pública de demostración. Configura FDC_API_KEY en Vercel para mayor capacidad.'
        : 'No se pudo consultar FoodData Central en este momento.'
    });
  }
}
