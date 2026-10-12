// LAB presentation helper. This is not a domain decision engine; the backend is
// the only source of canonical facts, local context only supplies safe guidance.
export function selectLabAnswer({canonical=null,plan=null,localFallback=''}={}){
  const validCanonical=canonical?.available===true
    && typeof canonical.text==='string'
    && canonical.text.length>0
    && canonical.text.length<=1500
    && /^[A-Z0-9_]{4,80}$/.test(String(canonical.reason||''));
  if(validCanonical)return{
    text:canonical.text,source:'LECTURA_CANÓNICA_LIMITADA',reason:canonical.reason
  };
  const guidance=typeof plan?.guidance==='string'?plan.guidance.trim():'';
  return{
    text:(guidance||String(localFallback||'No tengo datos autorizados para responder.')).slice(0,1500),
    source:'ORIENTACIÓN_LOCAL_SIN_DATOS_CANÓNICOS',
    reason:/^[A-Z0-9_]{4,80}$/.test(String(canonical?.reason||''))?canonical.reason:'LAB_LOCAL_ONLY'
  };
}
