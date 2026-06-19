export const SheetsService = {
  async sync(url, payload) {
    if (!url) throw new Error('URL de Google Apps Script no configurada.');
    const response = await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: true, response };
  }
};
