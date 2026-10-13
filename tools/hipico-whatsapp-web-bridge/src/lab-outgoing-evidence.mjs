// Strict evidence for a tag rendered in an OUTGOING WhatsApp LAB message.
// An arbitrary mention in a quote, incoming message, log, or unrelated reply
// must not confirm a durable delivery ACK. The caller must independently pin
// the currently opened chat to the authorized LAB group before reading DOM.
const TAG=/^\[(LABTEST|SHADOW):[a-f0-9]{10}\]$/;

export function labOutgoingEvidenceMatches(messageText,expectedTag){
  if(typeof expectedTag!=='string'||!TAG.test(expectedTag)||typeof messageText!=='string'){
    return false;
  }
  const text=messageText.replace(/\r\n?/g,'\n').replace(/\u200b/g,'').trim();
  if(!text||text.length>4200)return false;
  const lines=text.split('\n').map(part=>part.trim());
  if(lines[0]!==expectedTag||lines.length<2)return false;
  if(expectedTag.startsWith('[LABTEST:')){
    // Only a complete LAB-test reply, never a forwarded/quoted bare tag.
    return lines[1]==='🧪 CONTROL HÍPICO · PRUEBA LAB' &&
      lines.some(line=>line.startsWith('Respuesta: ')) &&
      lines.some(line=>line.startsWith('Fuente: '));
  }
  // Backend/local SOURCE mirrors can have different body layouts. Their
  // first line must still be an exact, standalone outgoing SHADOW tag.
  return lines.slice(1).some(line=>line.length>0);
}
