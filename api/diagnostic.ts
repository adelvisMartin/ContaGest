export default async function diagnosticHandler(_request: unknown, response: any) {
  try {
    const module = await import('../backend/src/app.ts');
    response.status(200).json({ ok: true, loaded: Boolean(module.default || module.createApp) });
  } catch (error: any) {
    response.status(500).json({
      ok: false,
      name: error?.name || 'Error',
      message: error?.message || String(error),
      code: error?.code || null,
      stack: String(error?.stack || '').split('\n').slice(0, 8)
    });
  }
}
