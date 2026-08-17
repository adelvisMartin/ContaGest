export type IntentResult={
  intent:string;
  risk:'safe'|'review'|'monetary';
  confidence:number;
  suggestion:string;
  autoEligible:boolean;
  reason:string;
};

/**
 * Classifier for the language already used by the recovered Control Hipico RC1
 * WhatsApp workflow. Operational intents are deliberately NEVER auto-eligible:
 * this module only labels traffic for shadow QA; it does not mutate race state,
 * balances, results, settlements or send group replies.
 */

const canonical=(value:string)=>String(value||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[“”"'`]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .toUpperCase();

const raceClose=/\b(?:CIERRA|CIERRE|CERRAR|CERRAMOS|CIERREN|CERRADA|CERRADO|NO\s+MAS\s+JUGADAS?|NO\s+VA\s+MAS|CARRERA\s+CERRADA|CERRADO\s+CERRADO|FIN\s+DE\s+CARRERA)\b/;
const dayClose=/\b(?:ESTO\s+ES\s+TODO\s+POR\s+EL\s+DIA\s+DE\s+HOY|LOS\s+ESPERAMOS\s+MANANA|CIERRE\s+DE\s+JORNADA|CERRAMOS\s+LA\s+JORNADA)\b/;
const result=/\b(?:LLEGADA|PIZARRA|RESULTADO|GANO|PRIMERO|SEGUNDO|TERCERO)\b/;
const balanceSnapshot=/\bTERCIO\s+DISPONIBLE\b/;
const settlementWord=/\b(?:LIQUIDACION|LIQUIDAR|LIQUIDADO|CUADRE|CUADRE\s+FINAL)\b/;
const planWord=/\bTERCIOS\b/;
const playerOffer=/^(?:JUEGO|JUEGA)\b/;
const receiverOffer=/^(?:CONSIGO|CONSIGUE)\b/;
const pendingConfirmation=/\b(?:DEBE\s+CONFIRMAR|POR\s+CONFIRMAR|FALTA\s+CONFIRMAR|ESPERANDO\s+CONFIRMACION)\b/;
const exactConfirmation=/^(?:J|JUGANDO|SF|S\s*\/\s*F|SE\s+FUE|OK|CONFIRMADO)$/;
const cancelOrCorrection=/\b(?:ANULA|ANULADO|ANULAR|CANCELA|CANCELADO|CANCELAR|CORRIGE|CORREGIR|CORRECCION|BORRA\s+(?:ESA|LA)\s+JUGADA|CAMBIA\s+(?:ESA|LA)\s+JUGADA)\b/;
const pollaOrParley=/\b(?:POLLA|PARLEY)\b/;
const genericMonetary=/\b(?:APUESTA|JUGADA|MONTO|SALDO|DISPONIBLE|DISPONIBLES|DEBO|DEBE|PAGO|PAGO|COBRO|PREMIO|RIESGO)\b|\b\d+(?:[.,]\d+)?\s*(?:K|MIL|MM?|MILLON(?:ES)?|BS|USD|\$)\b/;
const greeting=/^(?:HOLA|BUENAS?|SALUDOS|BUEN\s+DIA|BUENAS\s+TARDES|BUENAS\s+NOCHES)\b/;
const help=/\b(?:AYUDA|COMO\s+FUNCIONA|INSTRUCCIONES|MENU|OPCIONES)\b/;
const status=/\b(?:ESTADO|RECIBIDO|PENDIENTE|REVISANDO|YA\s+LLEGO)\b/;

const operational=(intent:string,risk:'review'|'monetary',confidence:number,suggestion:string,reason:string):IntentResult=>({
  intent,risk,confidence,suggestion,autoEligible:false,reason
});

export const OPERATIONAL_INTENTS=new Set([
  'offer_player',
  'offer_receiver',
  'offer_confirmation',
  'pending_confirmation',
  'cancel_or_correction',
  'race_close',
  'day_close',
  'race_result',
  'balance_snapshot',
  'plan_snapshot',
  'settlement_snapshot',
  'polla_or_parley',
  'betting_or_balance'
]);

export function classify(text:string):IntentResult {
  const body=String(text||'').trim();
  if(!body)return{
    intent:'empty',risk:'review',confidence:0,
    suggestion:'No recibi texto para analizar.',autoEligible:false,reason:'EMPTY'
  };

  const c=canonical(body);

  // State transitions and snapshots are checked before the broad monetary
  // fallback so phrases such as "Cierra carrera 4" retain their true meaning.
  if(dayClose.test(c))return operational(
    'day_close','review',.995,
    'Cierre de jornada detectado. Queda registrado para revision; no se cambia automaticamente el estado de la jornada.',
    'DAY_CLOSE_REVIEW_GATE'
  );
  if(raceClose.test(c))return operational(
    'race_close','review',.995,
    'Cierre de carrera detectado. Se validara la carrera activa antes de aceptar cualquier cambio de estado.',
    'CLOSE_REVIEW_GATE'
  );
  if(result.test(c))return operational(
    'race_result','review',.99,
    'Llegada o pizarra detectada. Se validara contra la carrera activa antes de aplicar resultados.',
    'RESULT_REVIEW_GATE'
  );
  if(balanceSnapshot.test(c))return operational(
    'balance_snapshot','monetary',.995,
    'Snapshot de disponibles detectado. Se conserva para conciliacion y revision; no modifica saldos automaticamente.',
    'BALANCE_SNAPSHOT_REVIEW_GATE'
  );

  const hasJuega=/\bJUEGA\b/.test(c);
  const hasConsigue=/\bCONSIGUE\b/.test(c);
  if(settlementWord.test(c)||(planWord.test(c)&&hasJuega&&hasConsigue))return operational(
    'settlement_snapshot','monetary',.985,
    'Liquidacion o cuadre detectado. Requiere conciliacion completa antes de afectar saldos o premios.',
    'SETTLEMENT_REVIEW_GATE'
  );
  if(planWord.test(c)&&hasJuega)return operational(
    'plan_snapshot','monetary',.98,
    'Plano de tercios detectado. Se registra para comparar ofertas y confirmaciones; no ejecuta jugadas.',
    'PLAN_REVIEW_GATE'
  );
  if(pendingConfirmation.test(c))return operational(
    'pending_confirmation','monetary',.985,
    'Confirmacion pendiente detectada. La jugada permanece sin efecto hasta quedar vinculada y validada.',
    'PENDING_CONFIRMATION_GATE'
  );
  if(cancelOrCorrection.test(c))return operational(
    'cancel_or_correction','monetary',.985,
    'Anulacion o correccion detectada. Debe vincularse a la jugada original antes de cualquier cambio.',
    'CORRECTION_REVIEW_GATE'
  );
  if(exactConfirmation.test(c))return operational(
    'offer_confirmation','monetary',.98,
    'Confirmacion corta detectada. Debe enlazarse con la oferta correcta antes de confirmar la operacion.',
    'CONFIRMATION_REVIEW_GATE'
  );
  if(receiverOffer.test(c))return operational(
    'offer_receiver','monetary',.995,
    'Oferta CONSIGUE detectada. Queda pendiente de emparejamiento y validacion; no afecta saldos.',
    'RECEIVER_OFFER_REVIEW_GATE'
  );
  if(playerOffer.test(c))return operational(
    'offer_player','monetary',.995,
    'Oferta JUEGA detectada. Queda pendiente de emparejamiento y validacion; no afecta saldos.',
    'PLAYER_OFFER_REVIEW_GATE'
  );
  if(pollaOrParley.test(c))return operational(
    'polla_or_parley','monetary',.99,
    'Operacion POLLA/PARLEY detectada. Requiere revision del operador antes de cualquier efecto monetario.',
    'POLLA_PARLEY_REVIEW_GATE'
  );
  if(genericMonetary.test(c))return operational(
    'betting_or_balance','monetary',.97,
    'Contenido monetario u operativo detectado. Queda pendiente de revision antes de afectar jugadas, riesgo o saldos.',
    'MONETARY_REVIEW_GATE'
  );

  if(greeting.test(c))return{
    intent:'greeting',risk:'safe',confidence:.99,
    suggestion:'Hola. Soy el asistente de Control Hipico. Puedo recibir consultas operativas; jugadas, saldos, cierres y resultados pasan controles adicionales.',
    autoEligible:true,reason:'SAFE_GREETING'
  };
  if(help.test(c))return{
    intent:'help',risk:'safe',confidence:.96,
    suggestion:'Puedo ayudar con el flujo de carrera y dudas de uso. Jugadas, saldos, cierres y resultados requieren validacion.',
    autoEligible:true,reason:'SAFE_HELP'
  };
  if(status.test(c))return{
    intent:'status_non_monetary',risk:'safe',confidence:.9,
    suggestion:'Mensaje de estado recibido. Si la consulta implica dinero o una jugada, no se confirmara automaticamente.',
    autoEligible:true,reason:'SAFE_STATUS'
  };

  return{
    intent:'conversation',risk:'review',confidence:.65,
    suggestion:'Mensaje recibido para revision. No se ejecuto ninguna operacion automatica.',
    autoEligible:false,reason:'AMBIGUOUS'
  };
}
