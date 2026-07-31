const VERSION = '11.10.0';

export default function healthHandler(_request: unknown, response: any) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    ok: true,
    status: 'healthy',
    service: 'ContaGest-VE API',
    version: VERSION,
    runtime: 'vercel-node',
    timestamp: new Date().toISOString()
  });
}
