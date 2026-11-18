// A late clinical read or delayed mutation must never be attached to a
// different patient or authenticated tenant/user. This is presentation
// isolation; the API remains the server-side BOLA/RBAC authority.
export function matchesActiveVeterinaryPatient({requestPatientId,activePatientId,requestEpoch,currentEpoch,requestScope,currentScope}) {
  return Boolean(requestPatientId && activePatientId && requestScope && currentScope
    && requestPatientId===activePatientId
    && requestEpoch===currentEpoch
    && requestScope===currentScope);
}
