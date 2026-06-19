export async function apiGet(baseUrl, path) {
  const base = (baseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function apiPost(baseUrl, path, body) {
  const base = (baseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
