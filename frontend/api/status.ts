const VERSION = '11.14.0';
// Production release marker: v11.14 passed CI, static QA and browser QA before deployment.

export default function statusHandler(_request: unknown, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    ok: true,
    status: 'healthy',
    service: 'ContaGest-VE API',
    version: VERSION,
    buildCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    runtime: 'vercel-node',
    timestamp: new Date().toISOString()
  });
}
