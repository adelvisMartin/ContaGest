export const veterinaryErrorMessage=(error,fallback='Ocurrió un error en Veterinaria.')=>{
  const value=error?.data?.message||error?.message||fallback;
  return String(value||fallback);
};

export function reportVeterinaryError(scope,error,fallback){
  const message=veterinaryErrorMessage(error,fallback);
  console.error('[veterinary]',{
    scope,
    name:error?.name||'Error',
    message,
    status:error?.status||error?.statusCode||null
  });
  return message;
}
