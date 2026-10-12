// LAB-only send decisions. SOURCE write remains forbidden by the source policy gate.
// Before the first Enter: retry only after the composer is known to be cleared.
// Once Enter is attempted: outcome may be ambiguous; never automatically resend.
export function labSendFailure({sendAttempted=false,composerCleared=false}={}){
  const safeToRetry=!sendAttempted&&composerCleared;
  const error=new Error(safeToRetry?'LAB_PRE_SEND_RETRYABLE':'LAB_DELIVERY_AMBIGUOUS');
  error.code=error.message;
  error.safeToRetry=safeToRetry;
  error.retryable=safeToRetry;
  return error;
}

export function labSeenOutcome({ignored=false,confirmed=false,error=null}={}){
  if(ignored)return'IGNORED';
  if(confirmed)return'DELIVERED';
  return error?.safeToRetry===true?'RETRY':'AMBIGUOUS';
}

export const __test__={labSendFailure,labSeenOutcome};
