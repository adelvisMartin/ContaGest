// This source placeholder is replaced by frontend/scripts/stage-backend.mjs during a successful production build.
// If deployment packaging captures the unstaged source, return a controlled 503 instead of throwing during module
// import and surfacing Vercel FUNCTION_INVOCATION_FAILED to end users.
export default function unstagedBackendHandler(_req,res){
  res.statusCode=503;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Retry-After','60');
  res.end(JSON.stringify({
    ok:false,
    error:'BACKEND_NOT_STAGED',
    message:'El backend de ContaGest no está disponible en este despliegue. Intenta nuevamente en unos minutos.'
  }));
}
