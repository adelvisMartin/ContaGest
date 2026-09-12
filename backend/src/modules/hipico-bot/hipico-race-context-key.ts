import crypto from 'node:crypto';
import type { OperationalEntities } from './hipico-operational-classifier.js';

function normalizedTrack(value:unknown){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ');
}

export function operationalRaceContextKey(entities:OperationalEntities|undefined|null){
  const track=normalizedTrack(entities?.racetrack);
  const raceNumber=Number(entities?.raceNumber);
  if(!track||!Number.isInteger(raceNumber)||raceNumber<=0)return null;
  const digest=crypto.createHash('sha256').update(`${track}|${raceNumber}`).digest('hex').slice(0,24);
  return `racectx_${digest}`;
}

export const __test__={normalizedTrack};
