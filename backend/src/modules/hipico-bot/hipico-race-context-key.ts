import crypto from 'node:crypto';
import { gregorianDaysInMonth } from './hipico-canonical-input-policy.js';

type RaceContextEntities={
  racetrack?:unknown;
  raceNumber?:unknown;
  raceDate?:unknown;
};

function normalizedTrack(value:unknown){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ');
}

function normalizedRaceDate(value:unknown){
  if(value===undefined||value===null||value==='')return null;
  const raw=String(value).trim();
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return undefined;
  const year=Number(match[1]);
  const month=Number(match[2]);
  const day=Number(match[3]);
  const daysInMonth=gregorianDaysInMonth(year,month);
  if(!daysInMonth||day<1||day>daysInMonth)return undefined;
  return raw;
}

/**
 * Deterministic race identity.
 *
 * Historical/shadow callers may omit raceDate and keep the legacy track+number
 * identity for observation-only diagnostics. Canonical state writers pass an
 * explicit YYYY-MM-DD raceDate, which makes the identity unique across race days
 * without inventing a date from the server clock or local timezone.
 */
export function operationalRaceContextKey(entities:RaceContextEntities|undefined|null){
  const track=normalizedTrack(entities?.racetrack);
  const raceNumber=Number(entities?.raceNumber);
  const raceDate=normalizedRaceDate(entities?.raceDate);
  if(!track||!Number.isInteger(raceNumber)||raceNumber<=0||raceDate===undefined)return null;
  const material=raceDate?`${raceDate}|${track}|${raceNumber}`:`${track}|${raceNumber}`;
  const digest=crypto.createHash('sha256').update(material).digest('hex').slice(0,24);
  return `racectx_${digest}`;
}

export const __test__={normalizedTrack,normalizedRaceDate};