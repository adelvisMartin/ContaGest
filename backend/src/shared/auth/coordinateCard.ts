import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../http.js';

const ROWS = 5;
const COLUMNS = 8;
const CHALLENGE_SIZE = 3;
const CHALLENGE_TTL_MS = 4 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const coordinateNames = () => Array.from({ length:COLUMNS }, (_,column) =>
  Array.from({ length:ROWS }, (_,row) => `${String.fromCharCode(65 + column)}${row + 1}`)
).flat();

const hmac = (value: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(value).digest('hex');
const cellHash = (cardId: string, coordinate: string, code: string) => hmac(`coordinate-card|${cardId}|${coordinate}|${code}`);
const requestFingerprint = (ip = '', userAgent = '') => hmac(`coordinate-request|${ip}|${userAgent}`);

function safeHexEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}

function randomCode() {
  return String(crypto.randomInt(0,10000)).padStart(4,'0');
}

function randomCoordinates(count = CHALLENGE_SIZE) {
  const pool = coordinateNames();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0,index + 1);
    [pool[index],pool[swap]] = [pool[swap],pool[index]];
  }
  return pool.slice(0,count).sort();
}

export async function coordinateCardStatus(tenantId: string,userId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","version","rows","columns","status","createdAt","lastUsedAt"
    FROM public."CoordinateCard" WHERE "tenantId"=$1 AND "userId"=$2 AND "status"='active' LIMIT 1
  `,tenantId,userId);
  const card = rows[0];
  return card ? {
    enrolled:true,
    id:card.id,
    version:Number(card.version),
    rows:Number(card.rows),
    columns:Number(card.columns),
    createdAt:new Date(card.createdAt).toISOString(),
    lastUsedAt:card.lastUsedAt ? new Date(card.lastUsedAt).toISOString() : null
  } : { enrolled:false };
}

export async function generateCoordinateCard(tenantId: string,userId: string) {
  const cardId = crypto.randomUUID();
  const coordinates = coordinateNames();
  const plainCells = Object.fromEntries(coordinates.map((coordinate) => [coordinate,randomCode()]));
  const hashes = Object.fromEntries(coordinates.map((coordinate) => [coordinate,cellHash(cardId,coordinate,plainCells[coordinate])]));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      UPDATE public."CoordinateCard" SET "status"='replaced',"revokedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "userId"=$2 AND "status"='active'
    `,tenantId,userId);
    await tx.$executeRawUnsafe(`
      INSERT INTO public."CoordinateCard" ("id","tenantId","userId","version","rows","columns","cellHashes","status","createdAt","updatedAt")
      VALUES ($1,$2,$3,COALESCE((SELECT max("version")+1 FROM public."CoordinateCard" WHERE "tenantId"=$2 AND "userId"=$3),1),$4,$5,$6::jsonb,'active',now(),now())
    `,cardId,tenantId,userId,ROWS,COLUMNS,JSON.stringify(hashes));
    await tx.$executeRawUnsafe(`
      UPDATE public."CoordinateChallenge" SET "usedAt"=COALESCE("usedAt",now())
      WHERE "tenantId"=$1 AND "userId"=$2 AND "usedAt" IS NULL
    `,tenantId,userId);
  });

  return {
    id:cardId,
    rows:ROWS,
    columns:COLUMNS,
    columnsLabels:Array.from({length:COLUMNS},(_,index)=>String.fromCharCode(65+index)),
    rowLabels:Array.from({length:ROWS},(_,index)=>String(index+1)),
    cells:plainCells,
    generatedAt:new Date().toISOString(),
    warning:'Esta tarjeta se muestra una sola vez. Guárdala en un lugar seguro; ContaGest no almacena los códigos en texto plano.'
  };
}

export async function revokeCoordinateCard(tenantId: string,userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE public."CoordinateCard" SET "status"='revoked',"revokedAt"=now(),"updatedAt"=now() WHERE "tenantId"=$1 AND "userId"=$2 AND "status"='active'`,tenantId,userId);
    await tx.$executeRawUnsafe(`UPDATE public."CoordinateChallenge" SET "usedAt"=COALESCE("usedAt",now()) WHERE "tenantId"=$1 AND "userId"=$2 AND "usedAt" IS NULL`,tenantId,userId);
  });
  return { revoked:true };
}

export async function issueCoordinateChallenge(input: {
  tenantId:string;
  userId:string;
  ip?:string;
  userAgent?:string;
  context?:Record<string,unknown>;
}) {
  const cards = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","version" FROM public."CoordinateCard" WHERE "tenantId"=$1 AND "userId"=$2 AND "status"='active' LIMIT 1
  `,input.tenantId,input.userId);
  if (!cards.length) return null;
  const card = cards[0];
  const coordinates = randomCoordinates();
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      UPDATE public."CoordinateChallenge" SET "usedAt"=COALESCE("usedAt",now())
      WHERE "tenantId"=$1 AND "userId"=$2 AND "usedAt" IS NULL
    `,input.tenantId,input.userId);
    await tx.$executeRawUnsafe(`
      INSERT INTO public."CoordinateChallenge" ("id","tenantId","userId","cardId","coordinates","context","fingerprintHash","expiresAt","attempts","maxAttempts","createdAt")
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,0,$9,now())
    `,challengeId,input.tenantId,input.userId,card.id,JSON.stringify(coordinates),JSON.stringify(input.context||{}),requestFingerprint(input.ip,input.userAgent),expiresAt,MAX_ATTEMPTS);
  });
  return {
    mfaRequired:true,
    method:'coordinate-card',
    challengeId,
    cardVersion:Number(card.version),
    coordinates,
    expiresAt:expiresAt.toISOString(),
    maxAttempts:MAX_ATTEMPTS
  };
}

export async function verifyCoordinateChallenge(input: {
  challengeId:string;
  answers:Record<string,string>;
  ip?:string;
  userAgent?:string;
}) {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT ch.*,card."cellHashes",card."status" AS "cardStatus"
    FROM public."CoordinateChallenge" ch
    JOIN public."CoordinateCard" card ON card."id"=ch."cardId"
    WHERE ch."id"=$1 LIMIT 1
  `,input.challengeId);
  const challenge = rows[0];
  if (!challenge) throw new HttpError(404,'Reto de coordenadas no encontrado.');
  if (challenge.usedAt) throw new HttpError(409,'Este reto ya fue utilizado. Solicita uno nuevo.');
  if (challenge.cardStatus !== 'active') throw new HttpError(403,'La tarjeta de coordenadas ya no está activa.');
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await prisma.$executeRawUnsafe(`UPDATE public."CoordinateChallenge" SET "usedAt"=now() WHERE "id"=$1`,challenge.id);
    throw new HttpError(410,'El reto de coordenadas expiró. Inicia sesión nuevamente.');
  }
  if (Number(challenge.attempts) >= Number(challenge.maxAttempts)) throw new HttpError(429,'Se agotaron los intentos del reto.');
  if (!safeHexEqual(challenge.fingerprintHash,requestFingerprint(input.ip,input.userAgent))) {
    throw new HttpError(403,'El reto debe completarse desde el mismo dispositivo y navegador.');
  }

  const coordinates = Array.isArray(challenge.coordinates) ? challenge.coordinates.map(String) : [];
  const hashes = challenge.cellHashes && typeof challenge.cellHashes === 'object' ? challenge.cellHashes as Record<string,string> : {};
  const valid = coordinates.every((coordinate) => {
    const answer = String(input.answers?.[coordinate] || '').trim();
    const expected = String(hashes[coordinate] || '');
    return /^\d{4}$/.test(answer) && expected && safeHexEqual(expected,cellHash(challenge.cardId,coordinate,answer));
  });
  if (!valid) {
    const attempts = Number(challenge.attempts) + 1;
    await prisma.$executeRawUnsafe(`UPDATE public."CoordinateChallenge" SET "attempts"=$2,"usedAt"=CASE WHEN $2 >= "maxAttempts" THEN now() ELSE NULL END WHERE "id"=$1`,challenge.id,attempts);
    throw new HttpError(422,attempts >= Number(challenge.maxAttempts) ? 'Tarjeta bloqueada para este intento. Inicia sesión nuevamente.' : `Coordenadas incorrectas. Quedan ${Number(challenge.maxAttempts)-attempts} intento(s).`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`UPDATE public."CoordinateChallenge" SET "attempts"="attempts"+1,"usedAt"=now() WHERE "id"=$1`,challenge.id);
    await tx.$executeRawUnsafe(`UPDATE public."CoordinateCard" SET "lastUsedAt"=now(),"updatedAt"=now() WHERE "id"=$1`,challenge.cardId);
  });
  return {
    tenantId:String(challenge.tenantId),
    userId:String(challenge.userId),
    context:challenge.context && typeof challenge.context === 'object' ? challenge.context : {}
  };
}
